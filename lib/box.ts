import crypto from "node:crypto";
import { BoxClient, BoxDeveloperTokenAuth } from "box-typescript-sdk-gen";
import { AuthorizationManager } from "box-typescript-sdk-gen/managers";
import { readByteStream } from "box-typescript-sdk-gen/internal";
import { getBoxTokens, setBoxTokens, type BoxTokens } from "@/lib/redis";
import { collectFiles, type BoxFile, type BoxItem } from "@/lib/sync";

export function getAuthorizeUrl(state: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.BOX_CLIENT_ID!,
    redirect_uri: process.env.BOX_REDIRECT_URI!,
    state,
  });
  return `https://account.box.com/api/oauth2/authorize?${p}`;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function isValidWebhookSignature(
  body: string,
  headers: Record<string, string | null>,
): boolean {
  const ts = headers["box-delivery-timestamp"] ?? "";
  const mk = (key?: string) =>
    key ? crypto.createHmac("sha256", key).update(body + ts).digest("base64") : "";
  const prim = mk(process.env.BOX_WEBHOOK_PRIMARY_KEY);
  const sec = mk(process.env.BOX_WEBHOOK_SECONDARY_KEY);
  const gotP = headers["box-signature-primary"] ?? "";
  const gotS = headers["box-signature-secondary"] ?? "";
  return (!!prim && safeEqual(prim, gotP)) || (!!sec && safeEqual(sec, gotS));
}

/**
 * We manage token persistence ourselves via Redis (lib/redis.ts), rather than
 * relying on the SDK's BoxOAuth in-memory/custom TokenStorage. So OAuth token
 * exchange/refresh go straight through AuthorizationManager (the same manager
 * BoxOAuth delegates to internally), and per-call BoxClient instances are
 * built from a raw access token via BoxDeveloperTokenAuth.
 */
const authorizationManager = new AuthorizationManager({});

function clientFromAccessToken(accessToken: string): BoxClient {
  return new BoxClient({ auth: new BoxDeveloperTokenAuth({ token: accessToken }) });
}

export async function exchangeCodeForTokens(code: string): Promise<BoxTokens> {
  const token = await authorizationManager.requestAccessToken({
    grantType: "authorization_code",
    clientId: process.env.BOX_CLIENT_ID!,
    clientSecret: process.env.BOX_CLIENT_SECRET!,
    code,
  });
  const tokens: BoxTokens = {
    accessToken: token.accessToken!,
    refreshToken: token.refreshToken!,
    expiresAt: Date.now() + (token.expiresIn ?? 0) * 1000,
  };
  await setBoxTokens(tokens);
  return tokens;
}

export async function getValidAccessToken(): Promise<string> {
  // Dev/testing shortcut: a Box Developer Token (Console → app → Configuration →
  // "Generate Developer Token", valid ~60 min) bypasses the OAuth flow entirely.
  // When BOX_DEVELOPER_TOKEN is set we use it directly; regenerate it when it expires.
  const devToken = process.env.BOX_DEVELOPER_TOKEN;
  if (devToken) {
    return devToken;
  }

  const tokens = await getBoxTokens();
  if (!tokens) {
    throw new Error("No Box tokens found. Complete the OAuth flow first.");
  }

  if (Date.now() <= tokens.expiresAt - 60_000) {
    return tokens.accessToken;
  }

  const refreshed = await authorizationManager.refreshAccessToken({
    grantType: "refresh_token",
    clientId: process.env.BOX_CLIENT_ID!,
    clientSecret: process.env.BOX_CLIENT_SECRET!,
    refreshToken: tokens.refreshToken,
  });

  const newTokens: BoxTokens = {
    accessToken: refreshed.accessToken!,
    refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
    expiresAt: Date.now() + (refreshed.expiresIn ?? 0) * 1000,
  };
  await setBoxTokens(newTokens);
  return newTokens.accessToken;
}

export async function downloadFile(
  fileId: string,
): Promise<{ name: string; buffer: Buffer }> {
  const accessToken = await getValidAccessToken();
  const client = clientFromAccessToken(accessToken);

  const [file, stream] = await Promise.all([
    client.files.getFileById(fileId),
    client.downloads.downloadFile(fileId),
  ]);

  if (!stream) {
    throw new Error(`Box returned no content for file ${fileId}`);
  }

  const buffer = await readByteStream(stream);
  return { name: file.name ?? fileId, buffer };
}

/**
 * List every file in a Box folder tree (recursive), starting at rootFolderId.
 * Used by the manual Sync flow to index files already in Box — listing the root
 * folder ("0") is allowed, unlike creating a webhook on it. The recursion and
 * pagination logic lives in lib/sync.ts (collectFiles); here we only bind it to
 * the real Box client.
 */
export async function listFolderFilesRecursive(
  rootFolderId: string,
): Promise<BoxFile[]> {
  const accessToken = await getValidAccessToken();
  const client = clientFromAccessToken(accessToken);

  const listPage = async (folderId: string, offset: number) => {
    const res = await client.folders.getFolderItems(folderId, {
      queryParams: { offset, limit: 1000 },
    });
    const items: BoxItem[] = (res.entries ?? []).map((e) => {
      const entry = e as { type?: string; id?: string; name?: string };
      return {
        type: entry.type ?? "",
        id: entry.id ?? "",
        name: entry.name ?? entry.id ?? "",
      };
    });
    return { items, totalCount: res.totalCount ?? items.length };
  };

  return collectFiles(listPage, rootFolderId);
}

export type TreeFile = { type: "file"; id: string; name: string };
export type TreeFolder = {
  type: "folder";
  id: string;
  name: string;
  children: TreeNode[];
};
export type TreeNode = TreeFile | TreeFolder;

/**
 * Build the Box folder tree (folders + files) starting at rootFolderId, so the
 * dashboard can show users the real structure of their Box. Recursion depth is
 * capped to keep API usage bounded on deep trees. Nodes are sorted folders-first,
 * then alphabetically, for a stable, readable render.
 */
export async function getFolderTree(rootFolderId: string): Promise<TreeNode[]> {
  const accessToken = await getValidAccessToken();
  const client = clientFromAccessToken(accessToken);

  async function walk(folderId: string, depth: number): Promise<TreeNode[]> {
    const nodes: TreeNode[] = [];
    let offset = 0;
    for (;;) {
      const res = await client.folders.getFolderItems(folderId, {
        queryParams: { offset, limit: 1000 },
      });
      const entries = res.entries ?? [];
      for (const e of entries) {
        const entry = e as { type?: string; id?: string; name?: string };
        if (!entry.id) continue;
        if (entry.type === "folder") {
          nodes.push({
            type: "folder",
            id: entry.id,
            name: entry.name ?? entry.id,
            children: depth < 8 ? await walk(entry.id, depth + 1) : [],
          });
        } else if (entry.type === "file") {
          nodes.push({ type: "file", id: entry.id, name: entry.name ?? entry.id });
        }
      }
      offset += entries.length;
      if (entries.length === 0 || offset >= (res.totalCount ?? entries.length)) break;
    }
    return nodes.sort((a, b) =>
      a.type !== b.type
        ? a.type === "folder"
          ? -1
          : 1
        : a.name.localeCompare(b.name),
    );
  }

  return walk(rootFolderId, 0);
}

export async function createWebhook(folderId: string): Promise<string> {
  const accessToken = await getValidAccessToken();
  const client = clientFromAccessToken(accessToken);

  const webhook = await client.webhooks.createWebhook({
    target: { type: "folder", id: folderId },
    triggers: ["FILE.UPLOADED"],
    address: `${process.env.APP_URL}/api/box/webhook`,
  });

  if (!webhook.id) {
    throw new Error("Box did not return a webhook id");
  }
  return webhook.id;
}
