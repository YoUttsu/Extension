// Store the playlist data globally
let playlistData = [];

// Execute immediately to avoid "receiving end does not exist" error
console.log("Playlist Mover content script loaded successfully");

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log("Message received:", request);

    if (request.action === "copy") {
        const result = copyPlaylist();
        console.log("Copy result:", result);
        sendResponse(result);
    } else if (request.action === "paste") {
        const result = pastePlaylist();
        console.log("Paste result:", result);
        sendResponse(result);
    }
    return true; // Required for asynchronous response
});

/**
 * Copy playlist from JioSaavn
 */
function copyPlaylist() {
    try {
        // Check if we're on JioSaavn
        if (!window.location.hostname.includes('jiosaavn')) {
            return {
                success: false,
                message: 'Not on JioSaavn. Please open a JioSaavn playlist.'
            };
        }

        // Try to find the main section > ol > li elements as per the instructions
        const mainTag = document.querySelector('main');
        if (!mainTag) {
            console.error("No main tag found");
            return { success: false, message: 'No playlist found (main tag missing).' };
        }

        const sectionTag = mainTag.querySelector('section');
        if (!sectionTag) {
            console.error("No section tag found in main");
            return { success: false, message: 'No playlist found (section tag missing).' };
        }

        const olTag = sectionTag.querySelector('ol');
        if (!olTag) {
            console.error("No ol tag found in section");
            return { success: false, message: 'No playlist found (ol tag missing).' };
        }

        const songItems = olTag.querySelectorAll('li');
        if (!songItems || songItems.length === 0) {
            console.error("No li items found in ol");
            return { success: false, message: 'No songs found in this playlist.' };
        }

        // Extract song information based on the correct HTML structure
        playlistData = Array.from(songItems).map((li, index) => {
            try {
                // Get figcaption that contains song info
                const figcaption = li.querySelector('figcaption');
                if (!figcaption) {
                    console.warn(`No figcaption found in li element at index ${index}`);
                    return {
                        index: index + 1,
                        name: 'Unknown Song',
                        artists: [],
                        duration: ''
                    };
                }

                // Get song name from h1 tag
                const songNameElement = figcaption.querySelector('h4');
                const songName = songNameElement ? songNameElement.textContent.trim() : 'Unknown Song';

                // Get artists from p > a tags
                const artistsContainer = figcaption.querySelector('p');
                let artists = [];

                if (artistsContainer) {
                    const artistElements = artistsContainer.querySelectorAll('a');
                    artists = Array.from(artistElements).map(a => a.textContent.trim());
                }

                // Try to get duration if available
                let duration = '';
                const durationElement = li.querySelector('[class*="duration"]') || li.querySelector('[class*="time"]');
                if (durationElement) {
                    duration = durationElement.textContent.trim();
                }

                return {
                    index: index + 1,
                    name: songName,
                    artists: artists,
                    duration: duration
                };
            } catch (err) {
                console.error(`Error parsing song at index ${index}:`, err);
                return {
                    index: index + 1,
                    name: 'Parse Error',
                    artists: [],
                    error: err.message
                };
            }
        });

        // Save to chrome.storage for persistence
        chrome.storage.local.set({ "playlistData": playlistData });

        // Log what we found in console for debugging
        console.log("Copied playlist data:", playlistData);

        return {
            success: true,
            songs: playlistData,
            message: `Successfully copied ${playlistData.length} songs!`
        };
    } catch (error) {
        console.error("Error in copyPlaylist:", error);
        return {
            success: false,
            message: `Error copying playlist: ${error.message}`
        };
    }
}

/**
 * Paste playlist to Spotify
 */
function pastePlaylist() {
    try {
        // Check if we're on Spotify
        if (!window.location.hostname.includes('spotify')) {
            return {
                success: false,
                message: 'Not on Spotify. Please open a Spotify playlist.'
            };
        }

        // Find the main tag and log input elements inside it
        const mainElement = document.getElementById('main') || document.querySelector('main');
        if (mainElement) {
            // Find all input elements inside main
            const inputElements = mainElement.querySelectorAll('input');

            console.log(`Found ${inputElements.length} input elements inside main tag`);
            inputElements.forEach((input, index) => {
                console.log(`Input #${index + 1}:`, {
                    type: input.type,
                    id: input.id,
                    name: input.name,
                    placeholder: input.placeholder,
                    value: input.value,
                    className: input.className
                });
            });

            // Also log the search input if one exists
            const searchInput = mainElement.querySelector('input[placeholder*="search" i], input[aria-label*="search" i]');
            if (searchInput) {
                console.log("Found search input:", searchInput);
            }
        } else {
            console.log("No main element found on this page");
        }

        // Check if we have playlist data
        return new Promise((resolve) => {
            chrome.storage.local.get("playlistData", function(result) {
                if (result.playlistData && result.playlistData.length > 0) {
                    console.log("Retrieved playlist data for pasting:", result.playlistData);

                    // For now, just log the songs we would be adding
                    let songsToAdd = result.playlistData.map(song => {
                        // Format the song data for display
                        const artistsText = song.artists && song.artists.length > 0 ?
                            song.artists.join(", ") : 'Unknown Artist';

                        return `${song.name} by ${artistsText}`;
                    });

                    console.log("Songs to add to Spotify playlist:", songsToAdd);

                    resolve({
                        success: false,
                        message: `Found ${result.playlistData.length} songs. Paste functionality coming soon!`
                    });
                } else {
                    resolve({
                        success: false,
                        message: 'No playlist data found. Copy a playlist first!'
                    });
                }
            });
        });
    } catch (error) {
        console.error("Error in pastePlaylist:", error);
        return {
            success: false,
            message: `Error pasting playlist: ${error.message}`
        };
    }
}