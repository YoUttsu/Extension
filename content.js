// Store the playlist data globally
let playlistData = [];

// Execute immediately to avoid "receiving end does not exist" error
console.log("Playlist Mover content script loaded successfully");

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log("Message received:", request);

    if (request.action === "ping") {
        // Respond to ping to confirm content script is loaded
        sendResponse({ status: "ok" });
    } else if (request.action === "copy") {
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

        // Check if we have playlist data
        return new Promise((resolve) => {
            chrome.storage.local.get("playlistData", function(result) {
                if (!result.playlistData || result.playlistData.length === 0) {
                    resolve({
                        success: false,
                        message: 'No playlist data found. Copy a playlist first!'
                    });
                    return;
                }

                console.log("Retrieved playlist data for pasting:", result.playlistData);

                // Create a copy of the playlist data that we can modify
                const songsToProcess = [...result.playlistData];
                const totalSongs = songsToProcess.length;
                let successCount = 0;
                let failCount = 0;

                // Process songs recursively
                function processNextSong(index) {
                    // If we've processed all songs, return the final result
                    if (index >= songsToProcess.length) {
                        resolve({
                            success: true,
                            message: `Added ${successCount} songs successfully, ${failCount} failed.`
                        });
                        return;
                    }

                    // Get the current song
                    const currentSong = songsToProcess[index];
                    console.log(`Processing song ${index + 1}/${songsToProcess.length}:`, currentSong.name);

                    // Try to add this song
                    addSongToPlaylist(currentSong)
                        .then(success => {
                            if (success) {
                                successCount++;
                                console.log(`Successfully added "${currentSong.name}" (${index + 1}/${totalSongs})`);
                            } else {
                                failCount++;
                                console.log(`Failed to add "${currentSong.name}" (${index + 1}/${totalSongs})`);
                            }

                            // Process the next song after a short delay to avoid overwhelming Spotify
                            setTimeout(() => {
                                processNextSong(index + 1);
                            }, 1500);
                        })
                        .catch(err => {
                            console.error(`Error adding song "${currentSong.name}":`, err);
                            failCount++;

                            // Continue with next song despite error
                            setTimeout(() => {
                                processNextSong(index + 1);
                            }, 1500);
                        });
                }

                // Start processing from the first song
                processNextSong(0);

                // Return an initial message that will be updated when the process completes
                resolve({
                    success: true,
                    message: `Started adding ${totalSongs} songs to playlist...`
                });
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
function addSongToPlaylist(song) {
    return new Promise((resolve) => {
        try {
            // Step 1: Find the search input
            const searchInput = findSpotifySearchInput();
            if (!searchInput) {
                console.error("Could not find Spotify search input");
                resolve(false);
                return;
            }

            console.log("Found Spotify search input");

            // Step 2: Construct and set the search query
            const searchQuery = constructSearchQuery(song);
            console.log(`Searching for: "${searchQuery}"`);

            // Focus the input and clear any existing value
            searchInput.focus();
            searchInput.value = '';

            // Set the new value
            setTimeout(() => {
                searchInput.value = searchQuery;
                triggerInputEvents(searchInput);
            }, 500);
            // Step 3: Trigger search events to make Spotify recognize the input

            // Step 4: Wait for search results before trying to find the song
            console.log("Waiting for search results to load...");
            setTimeout(() => {
                try {
                    console.log("Checking for song rows in search results...");
                    // Try to find song rows after search results load
                    const songRows = findSpotifySongRows();
                    if (!songRows || songRows.length === 0) {
                        console.error("Could not find any song rows after search");
                        resolve(false);
                        return;
                    }

                    console.log(`Found ${songRows.length} song rows after search`);

                    // Get the first song row to add
                    const firstSongRow = songRows[0];
                    console.log("First song row:", firstSongRow);

                    // Wait an additional second for the DOM to fully stabilize
                    console.log("Waiting for DOM to stabilize before clicking add button...");
                    setTimeout(() => {
                        try {
                            // Try to find the add button in this row
                            const addButton = findAddButtonInRow(firstSongRow);
                            if (!addButton) {
                                console.error("Could not find add button in song row");
                                resolve(false);
                                return;
                            }

                            console.log("Found add button");

                            // Simulate hovering over the row to make button visible if needed
                            simulateHover(firstSongRow);

                            // Wait a short time after hover for any hover effects to appear
                            setTimeout(() => {
                                // Click the add button
                                console.log("Clicking add button...");
                                addButton.click();

                                // Consider it successful if we got this far
                                resolve(true);
                            }, 200);
                        } catch (error) {
                            console.error("Error finding or clicking add button:", error);
                            resolve(false);
                        }
                    }, 3000); // Wait 1 additional second for DOM to stabilize
                } catch (error) {
                    console.error("Error in search results processing:", error);
                    resolve(false);
                }
            }, 4000); // Wait 2 seconds for search results to load
        } catch (error) {
            console.error("Error in addSongToPlaylist:", error);
            resolve(false);
        }
    });
}
function triggerInputEvents(input) {
    if (!input) return;

    // Create and dispatch an input event
    const inputEvent = new Event('input', {
        bubbles: true,
        cancelable: true,
    });
    input.dispatchEvent(inputEvent);

    // Create and dispatch a change event
    const changeEvent = new Event('change', {
        bubbles: true,
        cancelable: true,
    });
    input.dispatchEvent(changeEvent);

    // Create and dispatch a keydown event for Enter key
    const keydownEvent = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Enter',
        keyCode: 13
    });
    input.dispatchEvent(keydownEvent);

    // Create and dispatch a keyup event for Enter key
    const keyupEvent = new KeyboardEvent('keyup', {
        bubbles: true,
        cancelable: true,
        key: 'Enter',
        keyCode: 13
    });
    input.dispatchEvent(keyupEvent);
}
/**
 * Find song rows in Spotify search results
 */
//TODO
function findSpotifySongRows() {
    // Select all elements with role="row" and aria-rowindex (excluding header row if needed)
    const songRows = document.querySelectorAll('div[role="row"][aria-rowindex="1"]');

    const validSongRows = Array.from(songRows).filter(row => {
        const gridCells = row.querySelectorAll('div[role="gridcell"]');
        return gridCells.length >= 4;
    });
    console.log(validSongRows)
    console.log(`Found ${validSongRows.length} valid song rows`);
    return validSongRows;
}

/**
 * Find the add button within a song row
 */
function findAddButtonInRow(songRow) {
    // Try to find all divs in the row
    const divs = songRow.querySelectorAll('div');
    console.log(`Found ${divs.length} divs in song row`);

    // If we have at least 4 divs, try to get the button in the 4th one
    if (divs.length >= 4) {
        const fourthDiv = divs[3]; // 0-based index, so 3 is the 4th div
        const button = fourthDiv.querySelector('button');

        if (button) {
            return button;
        }
    }

    // Alternative approach: look for any button in the row that might be the add button
    const buttons = songRow.querySelectorAll('button');
    console.log(`Found ${buttons.length} buttons in song row`);

    for (let button of buttons) {
        // Look for buttons that have add-related attributes or text content
        if (
            button.getAttribute('aria-label')?.toLowerCase().includes('add') ||
            button.textContent?.toLowerCase().includes('add') ||
            button.title?.toLowerCase().includes('add')
        ) {
            return button;
        }

        // If we can't find a specific "add" button, return the last button which often represents actions
        if (buttons.length > 0) {
            return buttons[buttons.length - 1];
        }
    }

    return null;
}

/**
 * Simulate hovering over an element to make buttons visible
 */
function simulateHover(element) {
    if (!element) return;

    // Create and dispatch a mouse enter event
    const mouseEnter = new MouseEvent('mouseenter', {
        bubbles: true,
        cancelable: true,
        view: window
    });

    element.dispatchEvent(mouseEnter);

    // Also try to add a hover class if that's what Spotify uses
    element.classList.add('hover');
}

/**
 * Find Spotify's search input field
 */
function findSpotifySearchInput() {
    // First priority: Look specifically for the Spotify search placeholder
    const spotifySearchInput = document.querySelector('input[placeholder="Search for songs or episodes"]');
    if (spotifySearchInput) {
        console.log("Found Spotify search input by exact placeholder match");
        return spotifySearchInput;
    }

    // Second priority: Look for inputs with similar placeholders (in case text varies slightly)
    const similarPlaceholders = document.querySelectorAll('input[placeholder*="Search for" i]');
    if (similarPlaceholders.length > 0) {
        console.log("Found input with similar placeholder");
        return similarPlaceholders[0];
    }

    // Third priority: Look for standard search inputs
    const searchInputs = document.querySelectorAll('input[type="search"], input[placeholder*="search" i], input[aria-label*="search" i]');
    if (searchInputs.length > 0) {
        console.log(`Found ${searchInputs.length} search inputs`);
        return searchInputs[0];
    }

    // Fourth priority: Look in the main element
    const mainElement = document.querySelector('main');
    if (mainElement) {
        const inputs = mainElement.querySelectorAll('input');
        console.log(`Found ${inputs.length} inputs in main element`);

        inputs.forEach((input, i) => {
            console.log(`Input #${i}:`, {
                type: input.type,
                placeholder: input.placeholder || "No placeholder",
                ariaLabel: input.getAttribute('aria-label') || "No aria-label",
                className: input.className
            });
        });

        if (inputs.length === 1) return inputs[0];

        // Try to find a text or search input
        for (let input of inputs) {
            if (input.type === 'text' || input.type === 'search' || !input.type) {
                return input;
            }
        }
    }

    // Final fallback: Try to find any input that might be a search box
    const allInputs = document.querySelectorAll('input');
    console.log(`Found ${allInputs.length} total inputs on page`);

    for (let input of allInputs) {
        const placeholder = input.placeholder?.toLowerCase() || '';
        if (placeholder.includes('search')) {
            console.log("Found input with search in placeholder:", input);
            return input;
        }
    }

    console.log("Could not find any suitable search input");
    return null;
}
/**
 * Construct a search query for a song
 */
function constructSearchQuery(song) {
    let query = song.name || '';

    // Add first artist if available
    if (song.artists && song.artists.length > 0) {
        query += ' ' + song.artists[0];
    }

    return query.trim();
}