document.addEventListener("DOMContentLoaded", () => {
  // Get references to HTML elements
  const requestPayloadElem = document.getElementById("requestPayload");
  const responsePayloadElem = document.getElementById("responsePayload");
  const statusMessageElem = document.getElementById("statusMessage");
  const timestampElem = document.getElementById("timestamp");
  const clearDataButton = document.getElementById("clearDataButton");
  const reattachButton = document.getElementById("reattachButton");

  /**
   * Displays the captured request and response data in the popup.
   * @param {object} data The captured data object.
   */
  function displayData(data) {
    if (data && data.request && data.response) {
      statusMessageElem.style.display = "none"; // Hide status message if data is present

      // Display request payload
      try {
        // Stringify with pretty printing (2 spaces for indentation)
        requestPayloadElem.textContent = JSON.stringify(
          data.request.payload,
          null,
          2
        );
      } catch (e) {
        requestPayloadElem.textContent =
          "Error parsing request payload or payload is not JSON.";
        console.error(
          "Error stringifying request payload:",
          e,
          data.request.payload
        );
      }

      // Display response payload
      try {
        // Check if response body is already a string (e.g. error message or non-JSON)
        if (typeof data.response.body === "string") {
          // Attempt to parse if it looks like JSON, otherwise display as is
          try {
            const parsedBody = JSON.parse(data.response.body);
            responsePayloadElem.textContent = JSON.stringify(
              parsedBody,
              null,
              2
            );
          } catch (parseError) {
            // If parsing fails, it's likely not JSON or malformed JSON, display as is
            responsePayloadElem.textContent = data.response.body;
          }
        } else if (typeof data.response.body === "object") {
          // If it's already an object, stringify it
          responsePayloadElem.textContent = JSON.stringify(
            data.response.body,
            null,
            2
          );
        } else {
          responsePayloadElem.textContent = String(data.response.body); // Fallback for other types
        }
      } catch (e) {
        responsePayloadElem.textContent = "Error processing response body.";
        console.error(
          "Error stringifying/processing response body:",
          e,
          data.response.body
        );
      }

      // Display timestamp
      timestampElem.textContent = `Last captured: ${new Date(
        data.timestamp
      ).toLocaleString()}`;
    } else {
      // If no data, show appropriate status message
      statusMessageElem.textContent =
        "No data captured yet. Interact with ChatGPT to trigger a conversation API call.";
      statusMessageElem.style.display = "block";
      requestPayloadElem.textContent = "N/A";
      responsePayloadElem.textContent = "N/A";
      timestampElem.textContent = "";
    }
  }

  // Load initial data from storage when popup opens
  chrome.storage.local.get("lastCapturedData", (result) => {
    if (chrome.runtime.lastError) {
      console.error(
        "Error loading data from storage:",
        chrome.runtime.lastError
      );
      statusMessageElem.textContent = "Error loading stored data.";
      return;
    }
    if (result.lastCapturedData) {
      displayData(result.lastCapturedData);
    } else {
      // Initial state if no data is stored yet
      statusMessageElem.textContent =
        "No data captured yet. Interact with ChatGPT to trigger a conversation API call.";
    }
  });

  // Listen for real-time updates from the background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "DATA_UPDATED") {
      // console.log("Popup received DATA_UPDATED:", message.data);
      displayData(message.data);
    }
    // It's good practice to return true if you intend to send a response asynchronously,
    // though not strictly necessary here as popup doesn't send a response back for DATA_UPDATED.
    return false;
  });

  // Event listener for the "Clear Displayed Data" button
  clearDataButton.addEventListener("click", () => {
    requestPayloadElem.textContent = "Cleared.";
    responsePayloadElem.textContent = "Cleared.";
    timestampElem.textContent = "";
    statusMessageElem.textContent =
      "Display cleared. New data will appear on the next capture.";
    statusMessageElem.style.display = "block";
    // Note: This only clears the popup display.
    // To clear the data from chrome.storage.local, you would use:
    // chrome.storage.local.remove('lastCapturedData', () => {
    //     console.log('Stored data cleared.');
    // });
  });

  // Event listener for the "Re-check Debugger" button
  reattachButton.addEventListener("click", async () => {
    statusMessageElem.textContent = "Attempting to re-check debugger status...";
    statusMessageElem.style.display = "block";
    try {
      // Get the currently active tab in the current window
      const [currentTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (currentTab && currentTab.id) {
        if (
          currentTab.url &&
          currentTab.url.startsWith("https://chatgpt.com/")
        ) {
          // Send a message to the background script to request a debugger check
          chrome.runtime.sendMessage(
            {
              type: "REQUEST_DEBUGGER_CHECK",
              tabId: currentTab.id,
              tabUrl: currentTab.url,
            },
            (response) => {
              if (chrome.runtime.lastError) {
                statusMessageElem.textContent = `Error communicating: ${chrome.runtime.lastError.message}`;
                console.error(
                  "Reattach button sendMessage error:",
                  chrome.runtime.lastError
                );
              } else if (response && response.status) {
                statusMessageElem.textContent = response.status;
              } else {
                statusMessageElem.textContent =
                  "Re-check command sent. Check background console for details.";
              }
            }
          );
        } else {
          statusMessageElem.textContent = "Active tab is not a ChatGPT page.";
        }
      } else {
        statusMessageElem.textContent = "Could not identify active tab.";
      }
    } catch (error) {
      console.error("Error in reattach button logic:", error);
      statusMessageElem.textContent = `Error: ${error.message}`;
    }
  });
});
