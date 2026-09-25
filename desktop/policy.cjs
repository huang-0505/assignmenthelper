const PRODUCTION = "https://assignmenthelper-mu.vercel.app";
function trustedPage(value, origin = PRODUCTION) {
  try {
    const url = new URL(value);
    return url.origin === origin && url.pathname === "/desktop";
  } catch {
    return false;
  }
}
function allowedPermission(permission, details = {}) {
  if (permission === "display-capture") return true;
  if (permission === "media") {
    // Electron uses mediaType on checks and mediaTypes on requests.
    if (details.mediaTypes)
      return (
        details.mediaTypes.length > 0 &&
        details.mediaTypes.every((t) => t === "video")
      );
    return details.mediaType === "video";
  }
  return false;
}
const SIZES = { idle: [320, 218], study: [340, 650], setup: [430, 700] };
module.exports = { PRODUCTION, trustedPage, allowedPermission, SIZES };
