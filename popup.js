document.addEventListener('DOMContentLoaded', function() {
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const clearBtn = document.getElementById('clearBtn');
  const status = document.getElementById('status');
  const results = document.getElementById('results');
  
  // Enable search on Enter key
  searchInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      performSearch();
    }
  });
  
  searchBtn.addEventListener('click', performSearch);
  clearBtn.addEventListener('click', clearResults);
  
  async function performSearch() {
    const searchTerm = searchInput.value.trim();
    
    if (!searchTerm) {
      showStatus('Please enter a search term', 'error');
      return;
    }
    
    // Disable button and show loading
    searchBtn.disabled = true;
    searchBtn.textContent = 'Searching...';
    showStatus('Starting search across all pages...', 'info');
    clearResults();
    
    try {
      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      // Check if we're on NetSuite
      if (!tab.url.includes('netsuite.com')) {
        showStatus('Please navigate to NetSuite script logs first', 'error');
        return;
      }
      
      // Inject and execute search script
      const searchResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: searchAllPages,
        args: [searchTerm]
      });
      
      if (searchResults && searchResults[0] && searchResults[0].result) {
        displayResults(searchResults[0].result);
      } else {
        showStatus('Search completed - no results found', 'info');
      }
      
    } catch (error) {
      console.error('Search error:', error);
      showStatus('Error during search: ' + error.message, 'error');
    } finally {
      // Re-enable button
      searchBtn.disabled = false;
      searchBtn.textContent = 'Search';
    }
  }
  
  function showStatus(message, type) {
    status.textContent = message;
    status.className = `status ${type}`;
    status.classList.remove('hidden');
  }
  
  function clearResults() {
    results.innerHTML = '';
    results.classList.add('hidden');
    status.classList.add('hidden');
  }
  
  function displayResults(searchResults) {
    if (searchResults.length === 0) {
      showStatus('No matches found on this page', 'info');
      return;
    }
    
    showStatus(`Found ${searchResults.length} matches`, 'success');
    
    results.innerHTML = '';
    searchResults.forEach(result => {
      const resultDiv = document.createElement('div');
      resultDiv.className = 'result-item';
      
      // Create clickable result that will scroll to the match
      resultDiv.innerHTML = `
        <div class="result-text">
          <span class="page-number">Page ${result.page}</span>
          ${result.text}
        </div>
      `;
      
      // Add click handler to scroll to the match
      resultDiv.addEventListener('click', () => {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'scrollToPosition',
            position: result.position
          });
        });
      });
      
      results.appendChild(resultDiv);
    });
    
    results.classList.remove('hidden');
  }
});

// Helper function to escape regex characters


// This function will be injected into the page
function searchAllPages(searchTerm) {
  return new Promise(async (resolve) => {
    const results = [];
    let currentPage = 1;
    let totalPages = 1;
    let hasMorePages = true;
    
    console.log('Starting NetSuite log search for:', searchTerm);
    
    // Function to search current page content
    function searchCurrentPage() {
      const matches = [];
      
      // Focus on NetSuite log tables
      const logSelectors = [
        'table[id*="log"] tr td',
        '#div__bodytab tbody tr td',
        '[id*="custpage"] td',
        '.uir-field-wrapper .uir-field',
        'table tr td',  // More general table cells
        '.uir-field'    // More general NetSuite fields
      ];
      
      // First, clear any existing highlights
      document.querySelectorAll('.ns-search-highlight').forEach(el => {
        const parent = el.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(el.textContent), el);
          parent.normalize();
        }
      });
      
      logSelectors.forEach(selector => {
        try {
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
              
              function escapeRegExp(string) {
                return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              }
              
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
                        
                        // Create result entry with page info
                        const contextText = text.length > 200 ? text.substring(0, 200) + '...' : text;
                        matches.push({
                          text: contextText,
                          position: {
                            top: span.getBoundingClientRect().top,
                            left: span.getBoundingClientRect().left
                          },
                          page: currentPage
                        });
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
        } catch (e) {
          console.log('Selector error:', selector, e);
        }
      });
      
      return matches;
    }
    
    // Function to detect pagination
    function detectPagination() {
      const paginationInfo = {
        hasPages: false,
        currentPage: 1,
        totalPages: 1,
        nextButton: null
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
      
      // Find next button
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
    
    // Function to go to next page
    async function goToNextPage() {
      const pagination = detectPagination();
      if (!pagination.hasPages || !pagination.nextButton) {
        hasMorePages = false;
        return false;
      }
      
      // Click the next button
      pagination.nextButton.click();
      
      // Wait for page to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      currentPage++;
      return true;
    }
    
    try {
      // Get initial pagination info
      const pagination = detectPagination();
      totalPages = pagination.totalPages;
      
      // Search all pages
      while (hasMorePages) {
        console.log(`Searching page ${currentPage} of ${totalPages}...`);
        
        // Search current page
        const pageResults = searchCurrentPage();
        results.push(...pageResults);
        
        // Try to go to next page
        const hasNext = await goToNextPage();
        if (!hasNext) break;
      }
      
      console.log(`Search completed. Total matches: ${results.length}`);
      resolve(results);
      
    } catch (error) {
      console.error('Search error:', error);
      resolve(results); // Return whatever results we have
    }
  });
}