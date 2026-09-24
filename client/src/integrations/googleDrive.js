export async function drive(action, vault) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("Set VITE_GOOGLE_CLIENT_ID and enable Google Drive API first. See README.");
  if (!window.google?.accounts) await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Google sign-in could not load"));
    document.head.append(s);
  });
  const token = await new Promise((resolve, reject) => window.google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: "https://www.googleapis.com/auth/drive.appdata",
    callback: r => r.error ? reject(new Error(r.error)) : resolve(r.access_token),
    error_callback: () => reject(new Error("Google sign-in cancelled"))
  }).requestAccessToken());
  const request = async (url, options = {}) => {
    const r = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...options.headers
      }
    });
    if (!r.ok) throw new Error(`Google Drive request failed (${r.status})`);
    return r.json();
  };
  const root = "https://www.googleapis.com/drive/v3/files";
  if (action === "restore") {
    const result = await request(`${root}?spaces=appDataFolder&orderBy=createdTime%20desc&pageSize=1&q=trashed%3Dfalse&fields=files(id,name)`);
    if (!result.files.length) throw new Error("No Drive backup found");
    return request(`${root}/${result.files[0].id}?alt=media`);
  }
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify({
    name: `cashmanage-${new Date().toISOString()}.json`,
    parents: ["appDataFolder"]
  })], {
    type: "application/json"
  }));
  form.append("file", new Blob([JSON.stringify(vault)], {
    type: "application/json"
  }));
  return request("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    body: form
  });
}
