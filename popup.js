document.addEventListener("DOMContentLoaded", () => {
  chrome.runtime.sendMessage({ type: "get-latest" }, (data) => {
    document.getElementById("req").textContent = data?.request
      ? stringify(data.request)
      : "none captured yet";
    document.getElementById("res").textContent = data?.response
      ? stringify(data.response)
      : "none captured yet";
  });
});

/* Pretty-print JSON if possible */
function stringify(obj) {
  if (typeof obj === "string") {
    try {
      return JSON.stringify(JSON.parse(obj), null, 2);
    } catch {
      return obj;
    }
  } else {
    return JSON.stringify(obj, null, 2);
  }
}
