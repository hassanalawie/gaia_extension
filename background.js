// background.js

// A set to keep track of tab IDs where the debugger is currently active.
const debuggingTabIds = new Set();
// A store for request details, keyed by requestId, to correlate with responses.
const requestDataStore = {};

const TARGET_URL = "https://chatgpt.com/backend-api/conversation";
const DEBUGGER_VERSION = "1.3"; // Chrome Debugging Protocol version

// Function to ensure the debugger is attached to a given tab if it's a ChatGPT tab.
async function ensureDebuggerAttached(tabId, tabUrl) {
  // Check if the provided URL is for ChatGPT.
  if (!tabUrl || !tabUrl.startsWith("https://chatgpt.com/")) {
    // If the tab is no longer on chatgpt.com, try to detach the debugger if it was active.
    if (debuggingTabIds.has(tabId)) {
      await detachDebugger(tabId);
    }
    return;
  }

  // If debugger is already attached to this tab, no action needed.
  if (debuggingTabIds.has(tabId)) {
    // console.log(`Debugger already attached to tab ${tabId}`);
    return;
  }

  try {
    // console.log(`Attempting to attach debugger to tab ${tabId}`);
    // Attach the debugger to the specified tab.
    await chrome.debugger.attach({ tabId }, DEBUGGER_VERSION);
    debuggingTabIds.add(tabId); // Add tabId to our set of active debugging tabs.
    // console.log(`Debugger attached to tab ${tabId}`);

    // Enable the Network domain of the debugger to receive network events.
    await chrome.debugger.sendCommand({ tabId }, "Network.enable");
    // console.log(`Network domain enabled for tab ${tabId}`);
  } catch (error) {
    console.error(`Error attaching debugger to tab ${tabId}:`, error.message);
    // If attaching failed (e.g., DevTools already open), remove from our tracking.
    debuggingTabIds.delete(tabId);
    // This error often occurs if another debugger (like Chrome DevTools) is already attached.
  }
}

// Function to detach the debugger from a tab.
async function detachDebugger(tabId) {
  if (debuggingTabIds.has(tabId)) {
    try {
      await chrome.debugger.detach({ tabId });
      // console.log(`Debugger detached from tab ${tabId}`);
    } catch (error) {
      // console.error(`Error detaching debugger from tab ${tabId}:`, error.message);
      // Log error but proceed to remove from tracking, as the debugger might be effectively detached.
    } finally {
      debuggingTabIds.delete(tabId); // Remove tabId from our set.
      // Clean up any request data associated with this tab that might not have completed.
      for (const requestId in requestDataStore) {
        if (requestDataStore[requestId].tabId === tabId) {
          delete requestDataStore[requestId];
        }
      }
    }
  }
}

// Listener for debugger events (network requests, responses, etc.).
chrome.debugger.onEvent.addListener(async (debuggeeId, message, params) => {
  const tabId = debuggeeId.tabId; // The tab from which the event originated.
  // Only process events from tabs we are actively debugging.
  if (!debuggingTabIds.has(tabId)) return;

  // Event: "Network.requestWillBeSent"
  // Fired when a request is about to be sent.
  if (message === "Network.requestWillBeSent") {
    // Check if the request URL matches our target URL.
    if (params.request.url === TARGET_URL) {
      // console.log(`[Tab ${tabId}] Request to target URL: ${params.requestId}`, params.request);
      // Store the request's postData (payload) and other details.
      // The requestId is used to correlate this request with its eventual response.
      requestDataStore[params.requestId] = {
        payload: params.request.postData,
        tabId: tabId,
        url: params.request.url,
        method: params.request.method,
      };
    }
  }
  // Event: "Network.loadingFinished"
  // Fired when a response has finished loading.
  else if (message === "Network.loadingFinished") {
    const requestInfo = requestDataStore[params.requestId];
    // Check if this response corresponds to a request we are tracking.
    if (requestInfo) {
      // console.log(`[Tab ${tabId}] Loading finished for target request: ${params.requestId}`);
      try {
        // Get the body of the HTTP response.
        const response = await chrome.debugger.sendCommand(
          { tabId: requestInfo.tabId },
          "Network.getResponseBody",
          { requestId: params.requestId }
        );

        // Prepare the data to be stored and displayed.
        const capturedData = {
          request: {
            url: requestInfo.url,
            method: requestInfo.method,
            // Attempt to parse request payload as JSON.
            payload: requestInfo.payload
              ? JSON.parse(requestInfo.payload)
              : null,
          },
          response: {
            // Attempt to parse response body as JSON.
            body: response.body
              ? JSON.parse(response.body)
              : "Response body not available or not JSON",
            base64Encoded: response.base64Encoded,
          },
          timestamp: new Date().toISOString(),
        };

        // console.log(`[Tab ${tabId}] Captured data for ${params.requestId}:`, capturedData);
        // Store the latest captured data locally.
        await chrome.storage.local.set({ lastCapturedData: capturedData });
        // Send a message to the popup (if open) to update its display.
        chrome.runtime.sendMessage({
          type: "DATA_UPDATED",
          data: capturedData,
        });
      } catch (error) {
        console.error(
          `[Tab ${tabId}] Error getting/parsing response body for ${params.requestId}:`,
          error.message
        );
        // Store error information if something went wrong.
        const errorData = {
          request: {
            url: requestInfo.url,
            method: requestInfo.method,
            payload: requestInfo.payload
              ? JSON.parse(requestInfo.payload)
              : "Error parsing request payload",
          },
          response: {
            body: `Error retrieving/parsing response body: ${error.message}`,
            base64Encoded: false,
          },
          timestamp: new Date().toISOString(),
        };
        await chrome.storage.local.set({ lastCapturedData: errorData });
        chrome.runtime.sendMessage({ type: "DATA_UPDATED", data: errorData });
      } finally {
        // Clean up the stored request info for this requestId as it's now processed.
        delete requestDataStore[params.requestId];
      }
    }
  }
});

// Listener for when the debugger is detached from a tab (e.g., DevTools opened, tab closed).
chrome.debugger.onDetach.addListener((source, reason) => {
  const tabId = source.tabId;
  if (tabId && debuggingTabIds.has(tabId)) {
    // console.log(`Debugger detached from tab ${tabId} due to: ${reason}`);
    debuggingTabIds.delete(tabId); // Remove from our active set.
    // Clean up any requests associated with this tabId that might not have completed.
    for (const requestId in requestDataStore) {
      if (requestDataStore[requestId].tabId === tabId) {
        delete requestDataStore[requestId];
      }
    }
  }
});

// Manage debugger attachment based on tab updates (navigation, reload).
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Ensure debugger is attached if the tab is updated to chatgpt.com and loading is complete.
  // Also, re-check if the tab was already on chatgpt.com but the extension was just installed/reloaded.
  // `changeInfo.url` is useful for SPA navigations, `tab.url` for initial load or full navigation.
  if (changeInfo.status === "complete" || changeInfo.url) {
    if (tab.url && tab.url.startsWith("https://chatgpt.com/")) {
      // Use a small delay to ensure the page is fully ready for debugger attachment,
      // especially after a reload or fresh navigation.
      setTimeout(() => ensureDebuggerAttached(tabId, tab.url), 100);
    } else {
      // If the tab navigates away from chatgpt.com, detach the debugger.
      await detachDebugger(tabId);
    }
  }
});

// Detach debugger when a tab is closed.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await detachDebugger(tabId);
});

// Function to check and attach to existing ChatGPT tabs.
async function attachToExistingChatGPTTabs() {
  // console.log("Checking existing tabs for ChatGPT instances.");
  try {
    const tabs = await chrome.tabs.query({ url: "https://chatgpt.com/*" });
    for (const tab of tabs) {
      if (tab.id) {
        // Ensure debugger is attached. Use tab.url to confirm it's still valid.
        await ensureDebuggerAttached(tab.id, tab.url);
      }
    }
  } catch (error) {
    console.error("Error querying tabs:", error);
  }
}

// Attempt to attach to existing ChatGPT tabs when the extension starts up.
chrome.runtime.onStartup.addListener(async () => {
  // console.log("Extension started up.");
  await attachToExistingChatGPTTabs();
});

// Also attempt to attach when the extension is installed/reloaded.
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install" || details.reason === "update") {
    // console.log(`Extension ${details.reason}ed.`);
    await attachToExistingChatGPTTabs();
  }
});

// Listener for messages from other parts of the extension (e.g., popup).
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    message.type === "REQUEST_DEBUGGER_CHECK" &&
    message.tabId &&
    message.tabUrl
  ) {
    // console.log(`Received REQUEST_DEBUGGER_CHECK for tab ${message.tabId}`);
    // Asynchronously attempt to attach and then send a response.
    ensureDebuggerAttached(message.tabId, message.tabUrl)
      .then(() => {
        sendResponse({
          status: `Debugger check initiated for tab ${message.tabId}.`,
        });
      })
      .catch((err) => {
        sendResponse({
          status: `Error during debugger check for tab ${message.tabId}: ${err.message}`,
        });
      });
    return true; // Indicates that the response will be sent asynchronously.
  }
  // Default handling if message type is not recognized or for synchronous messages.
  return false;
});

// console.log("Background script loaded and event listeners registered.");
