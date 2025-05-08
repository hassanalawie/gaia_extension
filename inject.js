// Runs in the page; monkey-patch fetch to clone request & response bodies
(function () {
  const oldFetch = window.fetch;
  window.fetch = async (...args) => {
    const req = args[0] instanceof Request ? args[0] : new Request(...args);
    const url = req.url || args[0];

    const body = req.method === "POST" ? await req.clone().text() : null;
    const res = await oldFetch(...args);

    if (url.includes("/backend-api/conversation")) {
      // Send response text back to the service-worker
      const resText = await res.clone().text();
      chrome.runtime.sendMessage({
        type: "conversation-response",
        payload: resText,
      });
      // Optionally also send the request body; the worker already has it
    }
    return res;
  };
})();
