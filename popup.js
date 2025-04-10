document.addEventListener('DOMContentLoaded', function() {
    const copyBtn = document.getElementById('copyBtn');
    const pasteBtn = document.getElementById('pasteBtn');
    const status = document.getElementById('status');

    // Check if content script is running on the current page
    function pingContentScript(callback) {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            // Use a try-catch to handle potential errors
            try {
                chrome.tabs.sendMessage(tabs[0].id, {action: "ping"}, function(response) {
                    if (chrome.runtime.lastError) {
                        console.log("Content script not available:", chrome.runtime.lastError);
                        callback(false);
                    } else {
                        callback(true);
                    }
                });
            } catch (error) {
                console.error("Error pinging content script:", error);
                callback(false);
            }
        });
    }

    // Check if we're on a supported site
    function checkSupportedSite(callback) {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (!tabs || tabs.length === 0) {
                callback(false);
                return;
            }

            const currentUrl = tabs[0].url || "";
            const isJioSaavn = currentUrl.includes('jiosaavn.com');
            const isSpotify = currentUrl.includes('spotify.com');

            if (!isJioSaavn && !isSpotify) {
                status.textContent = 'Please open JioSaavn or Spotify to use this extension.';
                return callback(false);
            }

            // Now check if content script is loaded
            pingContentScript(function(scriptAvailable) {
                if (!scriptAvailable) {
                    status.textContent = 'Extension not initialized on this page. Please refresh the page.';
                    return callback(false);
                }

                callback(true, isJioSaavn ? 'jiosaavn' : 'spotify');
            });
        });
    }

    // Copy button handler
    copyBtn.addEventListener('click', function() {
        status.textContent = "Checking page...";

        checkSupportedSite(function(supported, site) {
            if (!supported) return;

            if (site !== 'jiosaavn') {
                status.textContent = 'To copy a playlist, please open JioSaavn.';
                return;
            }

            status.textContent = "Copying playlist...";

            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {action: "copy"}, function(response) {
                    if (chrome.runtime.lastError) {
                        console.error(chrome.runtime.lastError);
                        status.textContent = 'Error: Content script not ready. Please refresh the page.';
                        return;
                    }

                    if (response && response.success) {
                        status.textContent = `Copied ${response.songs.length} songs!`;
                    } else {
                        status.textContent = response && response.message ?
                            response.message : 'No playlist found on this page.';
                    }
                });
            });
        });
    });

    // Paste button handler
    pasteBtn.addEventListener('click', function() {
        status.textContent = "Checking page...";

        checkSupportedSite(function(supported, site) {
            if (!supported) return;

            if (site !== 'spotify') {
                status.textContent = 'To paste a playlist, please open Spotify.';
                return;
            }

            status.textContent = "Loading playlist data...";

            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {action: "paste"}, function(response) {
                    if (chrome.runtime.lastError) {
                        console.error(chrome.runtime.lastError);
                        status.textContent = 'Error: Content script not ready. Please refresh the page.';
                        return;
                    }

                    if (response && response.success) {
                        status.textContent = 'Playlist pasted successfully!';
                    } else {
                        status.textContent = response && response.message ?
                            response.message : 'Failed to paste playlist.';
                    }
                });
            });
        });
    });

    // Check site on popup load and update UI accordingly
    status.textContent = "Checking site...";
    checkSupportedSite(function(supported, site) {
        if (supported) {
            if (site === 'jiosaavn') {
                copyBtn.disabled = false;
                pasteBtn.disabled = true;
                status.textContent = 'Ready to copy from JioSaavn';
            } else {
                copyBtn.disabled = true;
                pasteBtn.disabled = false;
                status.textContent = 'Ready to paste to Spotify';
            }
        } else {
            copyBtn.disabled = true;
            pasteBtn.disabled = true;
        }
    });
});