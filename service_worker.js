/* Stores the last request/response we saw */
let latest = { request: null, response: null };

/* Capture the POST body before it leaves */
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // body appears as ArrayBuffers in requestBody.raw[*].bytes
    const raw = details?.requestBody?.raw?.[0]?.bytes;
    if (!raw) return;
    const text = new TextDecoder().decode(raw);
    try {
      latest.request = JSON.parse(text);
    } catch {
      latest.request = text;
    } // not JSON? just keep the plain string
  },
  {
    urls: ["https://chatgpt.com/backend-api/conversation*"],
  },
  ["requestBody"]
);

/* Receive the response body from the page context */
chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  if (msg.type === "conversation-response") {
    latest.response = msg.payload;
  } else if (msg.type === "get-latest") {
    sendResponse(latest); // popup asks for data
  }
});
