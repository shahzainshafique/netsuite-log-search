// Background script for NetSuite Script Log Search Extension
// Service worker for Manifest V3

chrome.runtime.onInstalled.addListener(() => {
  console.log('NetSuite Script Log Search Extension installed');
  
  // Create context menu for right-click search
  chrome.contextMenus.create({
    id: "searchNetSuiteLogs",
    title: "Search in NetSuite Logs",
    contexts: ["selection"],
    documentUrlPatterns: ["*://*.netsuite.com/*"]
  });
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openPopup') {
    // Unfortunately, we can't programmatically open the popup in Manifest V3
    // But we can show a notification or update the badge
    chrome.action.setBadgeText({
      text: '!',
      tabId: sender.tab.id
    });
    
    chrome.action.setBadgeBackgroundColor({
      color: '#4CAF50',
      tabId: sender.tab.id
    });
    
    // Clear badge after 3 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({
        text: '',
        tabId: sender.tab.id
      });
    }, 3000);
  }
});

// Update extension title based on current tab
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    
    if (tab.url && tab.url.includes('netsuite.com')) {
      chrome.action.setTitle({
        title: "NetSuite Script Log Search - Click to search logs",
        tabId: activeInfo.tabId
      });
    } else {
      chrome.action.setTitle({
        title: "NetSuite Script Log Search - Navigate to NetSuite to use",
        tabId: activeInfo.tabId
      });
    }
  } catch (error) {
    console.log('Error updating extension state:', error);
  }
});

// Handle URL changes within the same tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    if (tab.url.includes('netsuite.com')) {
      chrome.action.setTitle({
        title: "NetSuite Script Log Search - Click to search logs",
        tabId: tabId
      });
    } else {
      chrome.action.setTitle({
        title: "NetSuite Script Log Search - Navigate to NetSuite to use",
        tabId: tabId
      });
    }
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "searchNetSuiteLogs" && info.selectionText) {
    // Send message to content script to perform search
    chrome.tabs.sendMessage(tab.id, {
      action: 'searchSelected',
      searchTerm: info.selectionText
    });
  }
});