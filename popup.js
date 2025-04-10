document.addEventListener('DOMContentLoaded', function() {
    const copyBtn = document.getElementById('copyBtn');
    const pasteBtn = document.getElementById('pasteBtn');
    const status = document.getElementById('status');

    // Check if we're on a supported site
    function checkSupportedSite(callback) {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            const currentUrl = tabs[0].url;
            const isJioSaavn = currentUrl.includes('jiosaavn.com');
            const isSpotify = currentUrl.includes('spotify.com');

            if (!isJioSaavn && !isSpotify) {
                status.textContent = 'Please open JioSaavn or Spotify to use this extension.';
                return callback(false);
            }

            callback(true, isJioSaavn ? 'jiosaavn' : 'spotify');
        });
    }

    // Copy button handler
    copyBtn.addEventListener('click', function() {
        checkSupportedSite(function(supported, site) {
            if (!supported) return;

            if (site !== 'jiosaavn') {
                status.textContent = 'To copy a playlist, please open JioSaavn.';
                return;
            }

            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {action: "copy"}, function(response) {
                    // Handle potential runtime.lastError before doing anything else
                    if (chrome.runtime.lastError) {
                        console.error(chrome.runtime.lastError);
                        status.textContent = 'Error: Could not connect to page. Try reloading.';
                        return;
                    }

                    if (response && response.success) {
                        status.textContent = `Copied ${response.songs.length} songs!`;
                    } else {
                        // Make sure response exists before trying to access its properties
                        status.textContent = response && response.message ?
                            response.message : 'No playlist found on this page.';
                    }
                });
            });
        });
    });

    // Paste button handler
    pasteBtn.addEventListener('click', function() {
        checkSupportedSite(function(supported, site) {
            if (!supported) return;

            if (site !== 'spotify') {
                status.textContent = 'To paste a playlist, please open Spotify.';
                return;
            }

            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {action: "paste"}, function(response) {
                    // Handle potential runtime.lastError
                    if (chrome.runtime.lastError) {
                        console.error(JSON.stringify(chrome.runtime.lastError));
                        status.textContent = 'Error: Could not connect to page. Try reloading.';
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