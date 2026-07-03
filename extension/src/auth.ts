import { getBaseUrl, setStoredSid, clearStoredSid } from "./storage";
import { authedFetch } from "./api";

/** Runs Box OAuth in a chrome.identity window and stores the resulting sid. */
export async function connectBox(): Promise<void> {
  const base = await getBaseUrl();
  const redirectUri = chrome.identity.getRedirectURL(); // https://<id>.chromiumapp.org/
  const state = crypto.randomUUID();

  // 1. Ask the backend for the Box authorize URL (binds state server-side).
  const startRes = await fetch(
    `${base}/api/box/oauth/ext-start?redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`,
  );
  if (!startRes.ok) throw new Error("Could not start Box login");
  const { url } = (await startRes.json()) as { url: string };

  // 2. Open the Box login window; Chrome resolves with the final redirect URL.
  const redirect = await new Promise<string>((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (responseUrl) => {
      if (chrome.runtime.lastError || !responseUrl) {
        reject(new Error("Connection cancelled"));
        return;
      }
      resolve(responseUrl);
    });
  });

  // 3. Extract code + state; verify state matches locally (CSRF).
  const returned = new URL(redirect);
  const code = returned.searchParams.get("code");
  const returnedState = returned.searchParams.get("state");
  if (!code || returnedState !== state) throw new Error("Box login failed");

  // 4. Exchange the code on the backend and store the returned sid.
  const finishRes = await fetch(`${base}/api/box/oauth/ext-finish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, state }),
  });
  if (!finishRes.ok) throw new Error("Box login failed");
  const { sid } = (await finishRes.json()) as { sid: string };
  await setStoredSid(sid);
}

export async function disconnect(): Promise<void> {
  try {
    await authedFetch("/api/box/disconnect", { method: "POST" });
  } catch {
    // Even if the server call fails, drop the local session.
  }
  await clearStoredSid();
}
