import { BoxClient, BoxDeveloperTokenAuth } from "box-typescript-sdk-gen";
import { AuthorizationManager } from "box-typescript-sdk-gen/managers";
import type { BoxApiError } from "box-typescript-sdk-gen/box/errors";
import { readByteStream } from "box-typescript-sdk-gen/internal";
import { getBoxTokens, setBoxTokens, clearBoxTokens, type BoxTokens } from "@/lib/redis";
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

/** Chrome extension OAuth redirect URIs are always https://<id>.chromiumapp.org/. */
export function isValidExtensionRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    return u.protocol === "https:" && u.hostname.endsWith(".chromiumapp.org");
  } catch {
    return false;
  }
}

/** Authorize URL for the extension flow — same as getAuthorizeUrl but with a
 *  caller-supplied redirect URI (the extension's chromiumapp.org callback). */
export function getExtensionAuthorizeUrl(state: string, redirectUri: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.BOX_CLIENT_ID!,
    redirect_uri: redirectUri,
    state,
  });
  return `https://account.box.com/api/oauth2/authorize?${p}`;
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
  return {
    accessToken: token.accessToken!,
    refreshToken: token.refreshToken!,
    expiresAt: Date.now() + (token.expiresIn ?? 0) * 1000,
  };
}

/** Resolve the Box account id for an access token — the identity we key on. */
export async function getBoxUserId(accessToken: string): Promise<string> {
  const client = clientFromAccessToken(accessToken);
  const me = await client.users.getUserMe();
  if (!me.id) throw new Error("Box /users/me returned no id");
  return me.id;
}

/**
 * The user's Box grant is gone — revoked in Box, or the refresh token expired.
 * Distinct from a transient Box failure: routes map this to a 401 so clients
 * drop their session and re-run OAuth, instead of retrying forever against a
 * dead grant.
 */
export class BoxAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoxAuthError";
  }
}

/**
 * Box's token endpoint answers 400 (invalid_grant) or 401 when the refresh
 * token is dead. Anything else (5xx, network) is transient — not a revocation.
 *
 * Duck-typed rather than `instanceof BoxApiError`: the SDK's ESM build wipes
 * `responseInfo` to undefined in the constructor (class-field define semantics
 * clobber the base class's Object.assign), and dual CJS/ESM builds make
 * instanceof unreliable. The status code is always in the message
 * ("400 invalid_grant; Request ID: …"), so fall back to parsing it there.
 */
function isRefreshRevoked(err: unknown): boolean {
  if (!(err instanceof Error) || err.name !== "BoxApiError") return false;
  const status =
    (err as BoxApiError).responseInfo?.statusCode ??
    Number(/^(\d{3})\s/.exec(err.message)?.[1]);
  return status === 400 || status === 401;
}

export async function getValidAccessToken(boxUserId: string): Promise<string> {
  const tokens = await getBoxTokens(boxUserId);
  if (!tokens) {
    throw new BoxAuthError("No Box tokens found. Complete the OAuth flow first.");
  }
  if (Date.now() <= tokens.expiresAt - 60_000) {
    return tokens.accessToken;
  }
  let refreshed;
  try {
    refreshed = await authorizationManager.refreshAccessToken({
      grantType: "refresh_token",
      clientId: process.env.BOX_CLIENT_ID!,
      clientSecret: process.env.BOX_CLIENT_SECRET!,
      refreshToken: tokens.refreshToken,
    });
  } catch (err) {
    if (isRefreshRevoked(err)) {
      // Dead grant: drop the tokens so every caller gets a clean BoxAuthError
      // (→ 401 → reconnect) instead of re-attempting a doomed refresh.
      await clearBoxTokens(boxUserId);
      throw new BoxAuthError("Box rejected the refresh token — access was revoked or expired.");
    }
    throw err;
  }
  const newTokens: BoxTokens = {
    accessToken: refreshed.accessToken!,
    refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
    expiresAt: Date.now() + (refreshed.expiresIn ?? 0) * 1000,
  };
  await setBoxTokens(boxUserId, newTokens);
  return newTokens.accessToken;
}

const MAX_FILE_BYTES = Number(process.env.MAX_FILE_MB ?? 25) * 1024 * 1024;

export async function downloadFile(
  boxUserId: string,
  fileId: string,
): Promise<{ name: string; buffer: Buffer }> {
  const accessToken = await getValidAccessToken(boxUserId);
  const client = clientFromAccessToken(accessToken);

  // Fetch metadata first and reject oversized files BEFORE pulling bytes into
  // memory — protects against OOM and Interfaze request-size/timeout failures.
  const file = await client.files.getFileById(fileId);
  const size = Number(file.size ?? 0);
  if (size > MAX_FILE_BYTES) {
    throw new Error(
      `File too large to process: ${(size / 1024 / 1024).toFixed(1)} MB ` +
        `(max ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(0)} MB)`,
    );
  }

  const stream = await client.downloads.downloadFile(fileId);
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
  boxUserId: string,
  rootFolderId: string,
): Promise<BoxFile[]> {
  const accessToken = await getValidAccessToken(boxUserId);
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
export async function getFolderTree(
  boxUserId: string,
  rootFolderId: string,
): Promise<TreeNode[]> {
  const accessToken = await getValidAccessToken(boxUserId);
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

/** Upload a file into a Box folder. Returns the new Box file id. */
export async function uploadFileToBox(
  boxUserId: string,
  parentId: string,
  name: string,
  bytes: ArrayBuffer,
): Promise<{ id: string; name: string }> {
  const token = await getValidAccessToken(boxUserId);
  const form = new FormData();
  form.append(
    "attributes",
    JSON.stringify({ name, parent: { id: parentId } }),
  );
  form.append("file", new Blob([bytes]), name);

  const res = await fetch("https://upload.box.com/api/2.0/files/content", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Box upload failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as {
    entries?: { id: string; name: string }[];
  };
  const entry = data.entries?.[0];
  if (!entry) throw new Error("Box upload returned no file");
  return { id: entry.id, name: entry.name };
}

/** Delete a Box file (moves it to trash). Treats 404 as already-gone. */
export async function deleteBoxFile(boxUserId: string, fileId: string): Promise<void> {
  const token = await getValidAccessToken(boxUserId);
  const res = await fetch(`https://api.box.com/2.0/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Box delete failed (${res.status}): ${await res.text()}`);
  }
}

/** Create a subfolder in Box. Returns the new folder id. */
export async function createBoxFolder(
  boxUserId: string,
  parentId: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const token = await getValidAccessToken(boxUserId);
  const res = await fetch("https://api.box.com/2.0/folders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, parent: { id: parentId } }),
  });
  if (!res.ok) {
    throw new Error(`Box folder create failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as { id: string; name: string };
  return { id: data.id, name: data.name };
}
