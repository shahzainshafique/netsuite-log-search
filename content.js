// Content script for NetSuite Script Log Search Extension
// This script runs on NetSuite pages and provides additional functionality

(function() {
  'use strict';
  
  // Only run on NetSuite domains
  if (!window.location.hostname.includes('netsuite.com')) {
    return;
  }
    // Helper function to escape regex characters
    function escapeRegExp(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  // Add visual indicator when extension is active
  function addExtensionIndicator() {
    if (document.getElementById('ns-search-indicator')) return;
    
    const indicator = document.createElement('div');
    indicator.id = 'ns-search-indicator';
    indicator.innerHTML = '🔍 NetSuite Search Extension Active';
    indicator.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #4CAF50;
      color: white;
      padding: 5px 10px;
      border-radius: 5px;
      font-size: 12px;
      z-index: 10000;
      font-family: Arial, sans-serif;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    
    document.body.appendChild(indicator);
    
    // Hide after 3 seconds
    setTimeout(() => {
      if (indicator && indicator.parentNode) {
        indicator.style.opacity = '0';
        indicator.style.transition = 'opacity 0.5s';
        setTimeout(() => {
          if (indicator && indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
          }
        }, 500);
      }
    }, 3000);
  }
  
  // Improve search highlighting
  function improveHighlighting() {
    const style = document.createElement('style');
    style.textContent = `
      .ns-search-highlight {
        background-color: #ffff99 !important;
        padding: 2px 4px !important;
        border-radius: 2px !important;
        font-weight: bold !important;
        box-shadow: 0 1px 2px rgba(0,0,0,0.1) !important;
      }
      
      .ns-search-result-item {
        border-left: 3px solid #4CAF50 !important;
        padding-left: 10px !important;
        margin: 5px 0 !important;
        background-color: #f9f9f9 !important;
      }
      
      .ns-search-page-nav {
        background-color: #e7f3ff !important;
        padding: 10px !important;
        border-radius: 5px !important;
        margin: 10px 0 !important;
        text-align: center !important;
        font-weight: bold !important;
        color: #0066cc !important;
      }
    `;
    document.head.appendChild(style);
  }
  
  // Helper function to detect NetSuite log pages
  function isLogPage() {
    const indicators = [
      'script execution log',
      'execution log',
      'debug log',
      'script log',
      'system notes'
    ];
    
    const pageTitle = document.title.toLowerCase();
    const pageContent = document.body.textContent.toLowerCase();
    
    return indicators.some(indicator => 
      pageTitle.includes(indicator) || pageContent.includes(indicator)
    );
  }
  
  // Enhanced pagination detection
  function detectPagination() {
    const paginationInfo = {
      hasPages: false,
      currentPage: 1,
      totalPages: 1,
      nextButton: null,
      prevButton: null
    };
    
    // Look for pagination elements
    const paginationSelectors = [
      '[id*="paging"]',
      '.paging',
      '[id*="nav"]',
      '[class*="page"]'
    ];
    
    paginationSelectors.forEach(selector => {
      const element = document.querySelector(selector);
      if (element) {
        const text = element.textContent;
        const pageMatch = text.match(/page\s+(\d+)\s+of\s+(\d+)/i);
        if (pageMatch) {
          paginationInfo.hasPages = true;
          paginationInfo.currentPage = parseInt(pageMatch[1]);
          paginationInfo.totalPages = parseInt(pageMatch[2]);
        }
      }
    });
    
    // Find navigation buttons
    const nextSelectors = [
      'a[id*="next"]',
      'input[value*="Next"]',
      'a[title*="Next"]',
      'img[alt*="Next"]'
    ];
    
    nextSelectors.forEach(selector => {
      const button = document.querySelector(selector);
      if (button && !button.disabled) {
        paginationInfo.nextButton = button;
      }
    });
    
    return paginationInfo;
  }
  
  // Add keyboard shortcut for quick search
  function addKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
      // Ctrl+Shift+F to open extension popup (if possible)
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        // Send message to background script to open popup
        chrome.runtime.sendMessage({action: 'openPopup'});
      }
    });
  }
  
  // Initialize content script
  function init() {
    // Only activate on log pages
    if (isLogPage()) {
      addExtensionIndicator();
      improveHighlighting();
      addKeyboardShortcuts();
      
      console.log('NetSuite Search Extension: Initialized on log page');
      
      // Store page info for the extension
      window.nsSearchExtension = {
        isLogPage: true,
        pagination: detectPagination(),
        initialized: Date.now()
      };
    }
  }
  
  // Wait for page to be fully loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getPageInfo') {
      sendResponse({
        isLogPage: isLogPage(),
        pagination: detectPagination(),
        url: window.location.href
      });
    } else if (request.action === 'searchSelected') {
      // Handle right-click search
      performQuickSearch(request.searchTerm);
    } else if (request.action === 'scrollToPosition') {
      // Handle scrolling to a specific position
      const { top, left } = request.position;
      window.scrollTo({
        top: top + window.scrollY,
        left: left + window.scrollX,
        behavior: 'smooth'
      });
    }
  });
  
  // Quick search function for right-click searches
  function performQuickSearch(searchTerm) {
    console.log('Performing quick search for:', searchTerm);
    
    // Clear previous highlights
    document.querySelectorAll('.ns-search-highlight').forEach(el => {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent), el);
        parent.normalize();
      }
    });
    
    let matchCount = 0;
    let firstMatch = null;
    
    // Focus on NetSuite log tables
    const logSelectors = [
      'table[id*="log"] tr td',
      '#div__bodytab tbody tr td',
      '[id*="custpage"] td',
      '.uir-field-wrapper .uir-field',
      'table tr td',  // More general table cells
      '.uir-field'    // More general NetSuite fields
    ];
    
    // Process each selector
    logSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        // Skip if element is already processed
        if (el.querySelector('.ns-search-highlight')) return;
        
        // Get text content
        const text = el.textContent || el.innerText || '';
        if (!text) return;
        
        // Check for match
        const searchTermLower = searchTerm.toLowerCase();
        const textLower = text.toLowerCase();
        
        if (textLower.includes(searchTermLower)) {
          // Store original HTML
          const originalHTML = el.innerHTML;
          
          // Create a temporary container
          const temp = document.createElement('div');
          temp.innerHTML = originalHTML;
          
          // Function to process text nodes
          function processTextNodes(node) {
            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent;
              if (text.toLowerCase().includes(searchTermLower)) {
                const parts = text.split(new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi'));
                const fragment = document.createDocumentFragment();
                
                parts.forEach(part => {
                  if (part.toLowerCase() === searchTermLower) {
                    const span = document.createElement('span');
                    span.textContent = part;
                    span.style.backgroundColor = '#ffff99';
                    span.style.fontWeight = 'bold';
                    span.classList.add('ns-search-highlight');
                    fragment.appendChild(span);
                    
                    if (!firstMatch) {
                      firstMatch = span;
                    }
                    matchCount++;
                  } else {
                    fragment.appendChild(document.createTextNode(part));
                  }
                });
                
                node.parentNode.replaceChild(fragment, node);
              }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              // Process child nodes
              Array.from(node.childNodes).forEach(processTextNodes);
            }
          }
          
          // Process all text nodes in the temporary container
          processTextNodes(temp);
          
          // Update the original element
          el.innerHTML = temp.innerHTML;
        }
      });
    });
    
    if (matchCount > 0 && firstMatch) {
      // Scroll to first match
      firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
      showQuickSearchResult(`Found ${matchCount} matches for "${searchTerm}"`);
    } else {
      showQuickSearchResult(`No matches found for "${searchTerm}"`);
    }
  }
  
  // Show quick search result notification
  function showQuickSearchResult(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 50px;
      right: 15px;
      background: #333;
      color: white;
      padding: 10px 15px;
      border-radius: 5px;
      font-size: 14px;
      z-index: 10000;
      font-family: Arial, sans-serif;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.5s';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 500);
    }, 3000);
  }
  

  
  // Function to highlight search results without DOM manipulation
  function highlightSearchResults(results) {
    // Clear previous highlights
    document.querySelectorAll('.ns-search-highlight').forEach(el => {
      el.style.backgroundColor = '';
      el.style.fontWeight = '';
      el.classList.remove('ns-search-highlight');
    });

    if (results && results.length > 0) {
      results.forEach(result => {
        if (result.element) {
          result.element.style.backgroundColor = '#ffff99';
          result.element.style.fontWeight = 'bold';
          result.element.classList.add('ns-search-highlight');
        }
      });

      // Scroll to first match
      const firstMatch = document.querySelector('.ns-search-highlight');
      if (firstMatch) {
        firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }
  
})();