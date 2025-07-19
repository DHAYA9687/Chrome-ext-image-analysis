// background.js
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: "helloOption",
            title: "👋 Show Hello",
            contexts: ["all"],
        });
        chrome.contextMenus.create({
            id: "analyzeImage",
            title: "🔍 Analyze Image with Gemini",
            contexts: ["image"],
        });
    });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "saveMessage") {
        const backendUrl = "http://localhost:5000/api/images";
        fetch(backendUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                image_url: request.imageUrl,
                description: request.message
            })
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Backend request failed: ${response.statusText}`);
                }
                return response.json();
            })
            .then(() => {
                sendResponse({ success: true });
            })
            .catch(error => {
                //console.error("Failed to save to backend:", error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Indicate asynchronous response
    }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "helloOption") {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: showHelloAlert
        });
    } else if (info.menuItemId === "analyzeImage") {
        const imageUrl = info.srcUrl;
        if (!imageUrl) {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (err) => alert(`Error: No image URL provided`),
                args: []
            });
            return;
        }
        try {

            // Show loading popup immediately
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: showLoadingPopup
            });


            const { base64, mimeType } = await fetchImageAsBase64(imageUrl);
            console.log("Base64 Image (first 100 chars):", base64.substring(0, 100));
            console.log("Detected MIME Type:", mimeType);
            const description = await analyzeImageWithGemini({ base64, mimeType });

            // Remove loading popup and show notification
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: showNotification,
                args: [description, imageUrl]
            });
        } catch (error) {
            console.error("Error in image analysis:", error);
            // Remove loading popup and show error
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: (err) => {
                    const existing = document.getElementById("gemini-loading-popup");
                    if (existing) existing.remove();
                    alert(`Error: ${err}`);
                },
                args: [error.message]
            });
        }
    }
});

async function fetchImageAsBase64(imageUrl) {
    try {
        const response = await fetch(imageUrl, { mode: 'cors' });
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
        const blob = await response.blob();
        const mimeType = blob.type;
        return {
            base64: await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    if (reader.result) {
                        resolve(reader.result.split(',')[1]);
                    } else {
                        reject(new Error("Failed to convert image to base64"));
                    }
                };
                reader.onerror = () => reject(new Error("Error reading image as base64"));
                reader.readAsDataURL(blob);
            }),
            mimeType
        };
    } catch (error) {
        throw new Error(`fetchImageAsBase64 failed: ${error.message}`);
    }
}

async function analyzeImageWithGemini({ base64, mimeType }) {
    const apiKey = "";
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const supportedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!supportedMimeTypes.includes(mimeType)) {
        throw new Error(`Unsupported image type: ${mimeType}. Supported types: ${supportedMimeTypes.join(', ')}`);
    }

    const requestBody = {
        contents: [
            {
                parts: [
                    { text: "Describe the following image in detail:" },
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: base64
                        }
                    }
                ]
            }
        ]
    };

    try {
        const res = await fetch(geminiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
        });

        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Gemini API request failed: ${res.status} - ${errorText}`);
        }

        const result = await res.json();
        console.log("Gemini API response:", result);

        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            throw new Error("No description found in Gemini API response");
        }

        return text;
    } catch (error) {
        console.error("Gemini API error:", error);
        return `⚠️ Error analyzing image: ${error.message}`;
    }
}

function showHelloAlert() {
    alert("✅ Hello from your custom context menu!");
}



// function showLoadingPopup() {
//     const existing = document.getElementById("gemini-loading-popup");
//     if (existing) existing.remove();

//     const div = document.createElement("div");
//     div.id = "gemini-loading-popup";
//     div.style.position = "fixed";
//     div.style.top = "20px";
//     div.style.right = "20px";
//     div.style.background = "#fff";
//     div.style.color = "#000";
//     div.style.padding = "15px";
//     div.style.border = "1px solid #ccc";
//     div.style.borderRadius = "10px";
//     div.style.boxShadow = "0 4px 8px rgba(0,0,0,0.2)";
//     div.style.zIndex = "99999";
//     div.style.maxWidth = "300px";
//     div.style.display = "flex";
//     div.style.alignItems = "center";
//     div.style.gap = "10px";

//     const textNode = document.createElement("span");
//     textNode.textContent = "Waiting for response...";
//     div.appendChild(textNode);

//     document.body.appendChild(div);
// }

function showLoadingPopup() {
    const existing = document.getElementById("gemini-loading-popup");
    if (existing) existing.remove();

    const div = document.createElement("div");
    div.id = "gemini-loading-popup";
    div.style.position = "fixed";
    div.style.top = "20px";
    div.style.right = "20px";
    div.style.background = "#fff";
    div.style.color = "#000";
    div.style.padding = "15px";
    div.style.border = "1px solid #ccc";
    div.style.borderRadius = "10px";
    div.style.boxShadow = "0 4px 8px rgba(0,0,0,0.2)";
    div.style.zIndex = "99999";
    div.style.maxWidth = "300px";
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.gap = "10px";

    const spinner = document.createElement("div");
    spinner.style.border = "3px solid #f3f3f3";
    spinner.style.borderTop = "3px solid #3498db";
    spinner.style.borderRadius = "50%";
    spinner.style.width = "20px";
    spinner.style.height = "20px";
    spinner.style.animation = "spin 1s linear infinite";
    div.appendChild(spinner);

    const textNode = document.createElement("span");
    textNode.textContent = "Waiting for response...";
    div.appendChild(textNode);

    const style = document.createElement("style");
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(div);
}


// function showNotification(description, imageUrl) {
//     const existing = document.getElementById("gemini-popup");
//     if (existing) existing.remove();

//     const div = document.createElement("div");
//     div.id = "gemini-popup";
//     div.style.position = "fixed";
//     div.style.top = "20px";
//     div.style.right = "20px";
//     div.style.background = "#fff";
//     div.style.color = "#000";
//     div.style.padding = "15px";
//     div.style.border = "1px solid #ccc";
//     div.style.borderRadius = "10px";
//     div.style.boxShadow = "0 4px 8px rgba(0,0,0,0.2)";
//     div.style.zIndex = "99999";
//     div.style.maxWidth = "300px";
//     div.style.maxHeight = "400px";
//     div.style.overflowY = "auto";
//     div.style.display = "flex";
//     div.style.flexDirection = "column";
//     div.style.gap = "10px";

//     const textNode = document.createElement("span");
//     textNode.textContent = description;
//     div.appendChild(textNode);

//     const closeBtn = document.createElement("button");
//     closeBtn.textContent = "×";
//     closeBtn.style.position = "absolute";
//     closeBtn.style.top = "5px";
//     closeBtn.style.right = "10px";
//     closeBtn.style.border = "none";
//     closeBtn.style.background = "transparent";
//     closeBtn.style.fontSize = "16px";
//     closeBtn.style.cursor = "pointer";
//     closeBtn.onclick = () => div.remove();
//     div.appendChild(closeBtn);

//     const saveButton = document.createElement("button");
//     saveButton.textContent = "Save";
//     saveButton.style.padding = "5px 10px";
//     saveButton.style.border = "1px solid #000000";
//     saveButton.style.background = "#f0f0f0";
//     saveButton.style.cursor = "pointer";
//     saveButton.style.alignSelf = "flex-end";
//     saveButton.onclick = () => {
//         chrome.runtime.sendMessage({ action: "saveMessage", message: description, imageUrl }, (response) => {
//             if (response?.success) {
//                 div.remove();
//             } else {
//                 console.error("Save failed:", response?.error);
//             }
//         });
//     };
//     div.appendChild(saveButton);

//     document.body.appendChild(div);
// }

function showNotification(description, imageUrl) {
    // Remove both loading and any existing description popup
    const existingLoading = document.getElementById("gemini-loading-popup");
    if (existingLoading) existingLoading.remove();
    const existingPopup = document.getElementById("gemini-popup");
    if (existingPopup) existingPopup.remove();

    const div = document.createElement("div");
    div.id = "gemini-popup";
    div.style.position = "fixed";
    div.style.top = "20px";
    div.style.right = "20px";
    div.style.background = "#fff";
    div.style.color = "#000";
    div.style.padding = "15px";
    div.style.border = "1px solid #ccc";
    div.style.borderRadius = "10px";
    div.style.boxShadow = "0 4px 8px rgba(0,0,0,0.2)";
    div.style.zIndex = "99999";
    div.style.maxWidth = "300px";
    div.style.maxHeight = "400px";
    div.style.overflowY = "auto";
    div.style.display = "flex";
    div.style.flexDirection = "column";
    div.style.gap = "10px";

    const textNode = document.createElement("span");
    textNode.textContent = description;
    div.appendChild(textNode);

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "×";
    closeBtn.style.position = "absolute";
    closeBtn.style.top = "5px";
    closeBtn.style.right = "10px";
    closeBtn.style.border = "none";
    closeBtn.style.background = "transparent";
    closeBtn.style.fontSize = "16px";
    closeBtn.style.cursor = "pointer";
    closeBtn.onclick = () => div.remove();
    div.appendChild(closeBtn);

    const saveButton = document.createElement("button");
    saveButton.textContent = "Save";
    saveButton.style.padding = "5px 10px";
    saveButton.style.border = "1px solid #000000";
    saveButton.style.background = "#f0f0f0";
    saveButton.style.cursor = "pointer";
    saveButton.style.alignSelf = "flex-end";
    saveButton.onclick = () => {
        chrome.runtime.sendMessage({ action: "saveMessage", message: description, imageUrl }, (response) => {
            if (response?.success) {
                div.remove();
                alert("Image data saved successfully!");
            } else {
                console.error("Save failed:", response?.error);
                alert(`Error saving image data: ${response?.error}`);
            }
        });
    };
    div.appendChild(saveButton);

    document.body.appendChild(div);
}