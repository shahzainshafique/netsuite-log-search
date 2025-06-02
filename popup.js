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
      
      // Re-enable button
      searchBtn.disabled = false;
      searchBtn.textContent = 'Search';
      
    } catch (error) {
      console.error('Search error:', error);
      showStatus('Error during search: ' + error.message, 'error');
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
        nextButton: null,
        rangeInput: null
      };
      
      // Look for NetSuite's range input
      const rangeInput = document.querySelector('input[name="inpt_scriptnoterange"]');
      if (rangeInput) {
        const title = rangeInput.getAttribute('title');
        if (title) {
          const match = title.match(/(\d+)\s+to\s+(\d+)\s+of\s+(\d+)/);
          if (match) {
            paginationInfo.hasPages = true;
            paginationInfo.currentPage = Math.ceil(parseInt(match[1]) / 25); // Assuming 25 items per page
            paginationInfo.totalPages = Math.ceil(parseInt(match[3]) / 25);
            paginationInfo.rangeInput = rangeInput;
            
            // Find the dropdown arrow
            const dropdownArrow = document.querySelector(`span[data-input-id="${rangeInput.id}"]`);
            if (dropdownArrow) {
              paginationInfo.nextButton = dropdownArrow;
            }
          }
        }
      }
      
      return paginationInfo;
    }
    
    // Function to wait for content to load
    function waitForContent() {
      return new Promise(resolve => {
        const checkContent = () => {
          const content = document.querySelector('table[id*="log"] tr td, #div__bodytab tbody tr td');
          if (content) {
            resolve();
          } else {
            setTimeout(checkContent, 500);
          }
        };
        checkContent();
      });
    }
    function openDropdown() {
      const dropdownArrow = document.querySelector('span.ddarrowSpan.uir-field-dropdown-arrow');
      const dropdownInput = document.getElementById('inpt_scriptnoterange_3');
      console.log('openDropdown', dropdownArrow);
      if (dropdownArrow) {
        // Try clicking the arrow first (most reliable)
        dropdownArrow.click();
        console.log('Dropdown arrow clicked');
        return true;
      } else if (dropdownInput) {
        // Fallback to focusing and clicking the input
        dropdownInput.focus();
        dropdownInput.click();
        console.log('Dropdown input clicked');
        return true;
      }
      
      console.error('Could not find dropdown element');
      return false;
    }
    function openDropdownThorough() {
      const dropdownInput = document.getElementById('inpt_scriptnoterange_3');
      
      if (dropdownInput) {
        // Focus the input first
        dropdownInput.focus();
        
        // Create and dispatch a proper click event
        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        
        dropdownInput.dispatchEvent(clickEvent);
        console.log('Dropdown interaction completed');
        return true;
      }
      
      return false;
    }

    async function waitForDropdown() {
      return new Promise((resolve) => {
        let attempts = 0;
        const maxAttempts = 10;
        
        const checkDropdown = () => {
          const dropdownDiv = document.querySelector('.dropdownDiv');
          if (dropdownDiv && window.getComputedStyle(dropdownDiv).visibility === 'visible') {
            console.log('Dropdown is visible');
            resolve(true);
            return;
          }
          
          attempts++;
          if (attempts >= maxAttempts) {
            console.log('Max attempts reached waiting for dropdown');
            resolve(false);
            return;
          }
          
          setTimeout(checkDropdown, 200);
        };
        
        checkDropdown();
      });
    }

    async function selectDropdownOption(optionText) {
      try {
        // 1. Find all relevant elements
        const rangeInput = document.querySelector('input[name="inpt_scriptnoterange"]');
        const hiddenInput = document.querySelector('input[name="scriptnoterange"]');
        
        if (!rangeInput || !hiddenInput) {
          console.error('Required elements not found');
          return false;
        }

        console.log('Found all required elements');

        // 2. Open dropdown and wait for it to be visible
        openDropdownThorough();
        const isDropdownVisible = await waitForDropdown();
        
        if (!isDropdownVisible) {
          console.error('Dropdown failed to become visible');
          return false;
        }

        // 3. Find the target option
        const dropdownDiv = document.querySelector('.dropdownDiv');
        if (!dropdownDiv) {
          console.error('Dropdown div not found');
          return false;
        }

        const options = dropdownDiv.querySelectorAll('div[id^="nl"]');
        console.log('Found options:', options.length);
        
        const targetOption = Array.from(options).find(opt => 
          opt.textContent.trim() === optionText
        );

        if (!targetOption) {
          console.error(`Option "${optionText}" not found`);
          return false;
        }

        console.log('Found target option:', targetOption.textContent);

        // 4. Update all relevant inputs
        rangeInput.value = optionText;
        rangeInput.setAttribute('title', optionText);
        hiddenInput.value = targetOption.id.replace('nl', '');

        // 5. Create and dispatch proper events
        const events = [
          new Event('change', { bubbles: true }),
          new Event('input', { bubbles: true }),
          new Event('blur', { bubbles: true })
        ];

        // Dispatch events on both inputs
        [rangeInput, hiddenInput].forEach(input => {
          events.forEach(event => {
            input.dispatchEvent(event);
          });
        });

        // 6. Click the target option
        const optionClickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        
        targetOption.dispatchEvent(optionClickEvent);
        console.log('Clicked target option');

        // 7. Wait for the page to update
        await new Promise(resolve => setTimeout(resolve, 1500));
        return true;

      } catch (error) {
        console.error('Error during dropdown interaction:', error);
        return false;
      }
    }
    
    // Function to go to next page
    async function goToNextPage() {
      const pagination = detectPagination();
      console.log('Pagination:', pagination);
      if (!pagination.hasPages || !pagination.rangeInput) {
        hasMorePages = false;
        return false;
      }
      
      // Calculate next range
      const currentStart = (pagination.currentPage - 1) * 25 + 1;
      const nextStart = currentStart + 25;
      const totalItems = pagination.totalPages * 25;
      
      if (nextStart > totalItems) {
        hasMorePages = false;
        return false;
      }

      console.log('Pagination details:', {
        currentPage: pagination.currentPage,
        totalPages: pagination.totalPages,
        nextStart,
        totalItems
      });

      // Click the dropdown to open it
      try {
        openDropdownThorough();
        const success = await selectDropdownOption('51 to 75 of 100');
  
        if (success) {
          // Wait for page to load
          await new Promise(resolve => setTimeout(resolve, 2000));
          console.log('success');
        }

        // dropdownButton.click();
        // console.log('Dropdown button clicked successfully');
      } catch (error) {
        console.error('Error clicking dropdown button:', error);
        return false;
      }

      // Wait for dropdown to open
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Find and click the next range option
      const dropdownOptions = document.querySelectorAll('.uir-dropdown-option');
      for (const option of dropdownOptions) {
        const text = option.textContent;
        if (text.includes(`${nextStart} to`)) {
          option.click();
          break;
        }
      }
      
      // Wait for content to load
      await waitForContent();
      
      // Additional wait to ensure content is fully loaded
      await new Promise(resolve => setTimeout(resolve, 1000));
      
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
        console.log(pageResults);
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