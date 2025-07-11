// Save settings to Chrome storage
async function saveSettings() {
    const selectedProvider = document.querySelector('input[name="provider-selection"]:checked');
    
    // 如果没有选中任何提供商，默认选择第一个
    if (!selectedProvider) {
        const firstProvider = document.querySelector('input[name="provider-selection"]');
        if (firstProvider) {
            firstProvider.checked = true;
        }
    }
    
    const providerSelection = document.querySelector('input[name="provider-selection"]:checked')?.id || 'openai';
    const language = document.getElementById('language-select').value;
    const settings = {
        providerSelection,
        language,
        openai: {
            apiKey: document.getElementById('openai-key').value,
            model: document.getElementById('openai-model').value
        },
        anthropic: {
            apiKey: document.getElementById('anthropic-key').value,
            model: document.getElementById('anthropic-model').value
        },
        gemini: {
            apiKey: document.getElementById('gemini-key').value,
            model: document.getElementById('gemini-model').value
        },
        deepseek: {
            apiKey: document.getElementById('deepseek-key').value,
            model: document.getElementById('deepseek-model').value
        },
        litellm: {
            apiKey: document.getElementById('litellm-key').value,
            model: document.getElementById('litellm-model').value
        }
    };

    try {
        await chrome.storage.sync.set({ settings });
        // Optional: Show save confirmation
        const saveButton = document.querySelector('button[type="submit"]');
        const originalText = saveButton.textContent;
        saveButton.textContent = 'Saved!';
        setTimeout(() => {
            saveButton.textContent = originalText;
        }, 2000);
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

async function sendBackgroundMessage(type, data) {
    let response;
    try {
        response = await chrome.runtime.sendMessage({type, data});
    } catch (error) {
        console.error(`Error sending browser runtime message ${type}:`, error);
        throw error;
    }

    if (!response) {
        console.error(`No response from background message ${type}`);
        throw new Error(`No response from background message ${type}`);
    }
    if (!response.success) {
        console.error(`Error response from background message ${type}:`, response.error);
        throw new Error(response.error);
    }

    return response.data;
}

// Fetch Gemini models from API
async function fetchGeminiModels() {
    try {
        // Get the API key from the input field
        const apiKey = document.getElementById('gemini-key').value;
        
        if (!apiKey) {
            throw new Error('请先输入Gemini API密钥');
        }

        const data = await sendBackgroundMessage('FETCH_GEMINI_MODELS', {
            apiKey: apiKey
        });

        const selectElement = document.getElementById('gemini-model');
        // Clear existing options
        selectElement.innerHTML = '';

        // Add models to select element
        data.models.forEach(model => {
            const option = document.createElement('option');
            // Use the model name (like "models/gemini-2.0-flash-lite") as value
            option.value = model.name;
            // Use display name for the text, fallback to name if no display name
            option.textContent = model.displayName || model.name;
            // Add description as title for tooltip
            if (model.description) {
                option.title = model.description;
            }
            selectElement.appendChild(option);
        });

        // If no models found, add a placeholder option
        if (data.models.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '未找到可用模型';
            selectElement.appendChild(option);
        }

        // Store the fetched models in chrome storage for future use
        await chrome.storage.local.set({
            geminiModels: {
                models: data.models,
                timestamp: Date.now()
            }
        });

        console.log(`成功获取 ${data.models.length} 个Gemini模型`);
        
    } catch (error) {
        console.log('获取Gemini模型列表时出错:', error);
        // Handle error by adding an error option
        const selectElement = document.getElementById('gemini-model');
        selectElement.innerHTML = '';
        const option = document.createElement('option');
        option.value = '';
        option.textContent = `错误: ${error.message}`;
        selectElement.appendChild(option);
        
        // Show error to user
        alert(`获取Gemini模型列表失败: ${error.message}`);
    }
}

// Function to filter LiteLLM models based on search term
function filterLiteLLMModels(searchTerm, allModels) {
    if (!searchTerm) {
        return allModels;
    }
    
    const lowerSearchTerm = searchTerm.toLowerCase();
    return allModels.filter(model => {
        const name = (model.displayName || model.name).toLowerCase();
        const description = (model.description || '').toLowerCase();
        return name.includes(lowerSearchTerm) || description.includes(lowerSearchTerm);
    });
}

// Function to update LiteLLM model dropdown options
function updateLiteLLMModelOptions(models, selectElement, currentValue) {
    selectElement.innerHTML = '';
    
    // Sort models alphabetically by display name
    const sortedModels = models.sort((a, b) => {
        const nameA = (a.displayName || a.name).toLowerCase();
        const nameB = (b.displayName || b.name).toLowerCase();
        return nameA.localeCompare(nameB);
    });
    
    // Add models to select element
    sortedModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        option.textContent = model.displayName || model.name;
        if (model.description) {
            option.title = model.description;
        }
        selectElement.appendChild(option);
    });
    
    // Restore the previous value if it exists in the options
    if (currentValue) {
        selectElement.value = currentValue;
    }
    
    // If no models found, add a "no results" option
    if (sortedModels.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No models found';
        option.disabled = true;
        selectElement.appendChild(option);
    }
}

// Function to fetch available LiteLLM models
async function fetchLiteLLMModels() {
    try {
        // Get the API key from the input field (optional for LiteLLM)
        const apiKey = document.getElementById('litellm-key').value;
        
        const data = await sendBackgroundMessage('FETCH_LITELLM_MODELS', {
            apiKey: apiKey || undefined
        });

        const inputElement = document.getElementById('litellm-model');
        
        // If models are returned, show them in a select dropdown instead of text input
        if (data.models && data.models.length > 0) {
            // Check if we need to replace the input with a select
            if (inputElement.tagName.toLowerCase() === 'input') {
                // Store the current value before replacing the element
                const currentValue = inputElement.value;
                
                const selectElement = document.createElement('select');
                selectElement.id = 'litellm-model';
                selectElement.name = 'litellm-model';
                selectElement.className = inputElement.className;
                
                // Replace input with select
                inputElement.parentNode.replaceChild(selectElement, inputElement);
                
                // Show search container
                const searchContainer = document.getElementById('litellm-search-container');
                if (searchContainer) {
                    searchContainer.classList.remove('hidden');
                }
                
                // Store all models for filtering
                selectElement.allModels = data.models;
                
                // Update options with all models
                updateLiteLLMModelOptions(data.models, selectElement, currentValue);
                
                // Add the dropdown arrow
                const container = selectElement.parentNode;
                if (!container.querySelector('svg')) {
                    const svg = document.createElement('div');
                    svg.innerHTML = `<svg class="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" data-slot="icon">
                        <path fill-rule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
                    </svg>`;
                    container.appendChild(svg.firstElementChild);
                }
                
                // Setup search functionality
                const searchInput = document.getElementById('litellm-model-search');
                if (searchInput) {
                    searchInput.addEventListener('input', (e) => {
                        const searchTerm = e.target.value;
                        const filteredModels = filterLiteLLMModels(searchTerm, data.models);
                        updateLiteLLMModelOptions(filteredModels, selectElement, selectElement.value);
                    });
                }
            } else {
                // Already a select, just update options but preserve current value
                const currentValue = inputElement.value;
                
                // Show search container
                const searchContainer = document.getElementById('litellm-search-container');
                if (searchContainer) {
                    searchContainer.classList.remove('hidden');
                }
                
                // Store all models for filtering
                inputElement.allModels = data.models;
                
                // Update options with all models
                updateLiteLLMModelOptions(data.models, inputElement, currentValue);
                
                // Setup search functionality if not already setup
                const searchInput = document.getElementById('litellm-model-search');
                if (searchInput && !searchInput.hasAttribute('data-setup')) {
                    searchInput.setAttribute('data-setup', 'true');
                    searchInput.addEventListener('input', (e) => {
                        const searchTerm = e.target.value;
                        const filteredModels = filterLiteLLMModels(searchTerm, data.models);
                        updateLiteLLMModelOptions(filteredModels, inputElement, inputElement.value);
                    });
                }
            }
            
            console.log(`加载了 ${data.models.length} 个LiteLLM模型`);
        } else {
            console.log('未找到LiteLLM模型');
        }

        // Cache the models data
        const modelsToCache = {
            models: data.models,
            timestamp: Date.now()
        };
        chrome.storage.local.set({ 'litellm-models-cache': modelsToCache });

    } catch (error) {
        console.error('获取LiteLLM模型时出错:', error);
        alert(`获取LiteLLM模型失败: ${error.message}`);
    }
}


// Load Gemini models from storage or use defaults
async function loadGeminiModels() {
    try {
        // Try to load cached models from storage
        const cachedData = await chrome.storage.local.get('geminiModels');
        const geminiModels = cachedData.geminiModels;
        
        const selectElement = document.getElementById('gemini-model');
        
        // Check if we have cached models and they're not too old (24 hours)
        const isDataFresh = geminiModels && 
            geminiModels.timestamp && 
            (Date.now() - geminiModels.timestamp) < 24 * 60 * 60 * 1000;
            
        if (isDataFresh && geminiModels.models && geminiModels.models.length > 0) {
            // Use cached models
            selectElement.innerHTML = '';
            geminiModels.models.forEach(model => {
                const option = document.createElement('option');
                option.value = model.name;
                option.textContent = model.displayName || model.name;
                if (model.description) {
                    option.title = model.description;
                }
                selectElement.appendChild(option);
            });
            console.log(`加载了 ${geminiModels.models.length} 个缓存的Gemini模型`);
        } else {
            // Use default models if no cached data or data is stale
            console.log('使用默认Gemini模型列表');
        }
    } catch (error) {
        console.error('加载Gemini模型时出错:', error);
        // Keep default models in case of error
    }
}

// Load LiteLLM models from storage or keep as input
async function loadLiteLLMModels() {
    try {
        // Try to load cached models from storage
        const cachedData = await chrome.storage.local.get('litellm-models-cache');
        const litellmModels = cachedData['litellm-models-cache'];
        
        const inputElement = document.getElementById('litellm-model');
        
        // Check if we have cached models and they're not too old (24 hours)
        const isDataFresh = litellmModels && 
            litellmModels.timestamp && 
            (Date.now() - litellmModels.timestamp) < 24 * 60 * 60 * 1000;
            
        if (isDataFresh && litellmModels.models && litellmModels.models.length > 0) {
            // Replace input with select if we have cached models
            if (inputElement.tagName.toLowerCase() === 'input') {
                const currentValue = inputElement.value;
                
                const selectElement = document.createElement('select');
                selectElement.id = 'litellm-model';
                selectElement.name = 'litellm-model';
                selectElement.className = inputElement.className;
                
                // Replace input with select
                inputElement.parentNode.replaceChild(selectElement, inputElement);
                
                // Show search container
                const searchContainer = document.getElementById('litellm-search-container');
                if (searchContainer) {
                    searchContainer.classList.remove('hidden');
                }
                
                // Store all models for filtering
                selectElement.allModels = litellmModels.models;
                
                // Update options with all models
                updateLiteLLMModelOptions(litellmModels.models, selectElement, currentValue);
                
                // Add the dropdown arrow
                const container = selectElement.parentNode;
                if (!container.querySelector('svg')) {
                    const svg = document.createElement('div');
                    svg.innerHTML = `<svg class="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" data-slot="icon">
                        <path fill-rule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
                    </svg>`;
                    container.appendChild(svg.firstElementChild);
                }
                
                // Setup search functionality
                const searchInput = document.getElementById('litellm-model-search');
                if (searchInput) {
                    searchInput.addEventListener('input', (e) => {
                        const searchTerm = e.target.value;
                        const filteredModels = filterLiteLLMModels(searchTerm, litellmModels.models);
                        updateLiteLLMModelOptions(filteredModels, selectElement, selectElement.value);
                    });
                }
            }
            console.log(`加载了 ${litellmModels.models.length} 个缓存的LiteLLM模型`);
        } else {
            // Keep as input field if no cached data or data is stale
            console.log('使用LiteLLM输入框');
        }
    } catch (error) {
        console.error('加载LiteLLM模型时出错:', error);
        // Keep as input field in case of error
    }
}
async function loadSettings() {
    try {
        const data = await chrome.storage.sync.get('settings');
        const settings = data.settings;

        if (settings) {
            // Set language selection
            if (settings.language) {
                document.getElementById('language-select').value = settings.language;
            }
            
            // Set provider selection
            const providerRadio = document.getElementById(settings.providerSelection);
            if (providerRadio) providerRadio.checked = true;

            // Set OpenAI settings
            if (settings.openai) {
                document.getElementById('openai-key').value = settings.openai.apiKey || '';
                document.getElementById('openai-model').value = settings.openai.model || 'gpt-4';
            }

            // Set Anthropic settings
            if (settings.anthropic) {
                document.getElementById('anthropic-key').value = settings.anthropic.apiKey || '';
                document.getElementById('anthropic-model').value = settings.anthropic.model || 'claude-3-opus';
            }
            
            // Set Gemini settings
            if (settings.gemini) {
                document.getElementById('gemini-key').value = settings.gemini.apiKey || '';
                // Load Gemini models first, then set the selected model
                await loadGeminiModels();
                document.getElementById('gemini-model').value = settings.gemini.model || 'gemini-2.0-flash-lite';
            }

            // Set DeepSeek settings
            if (settings.deepseek) {
                document.getElementById('deepseek-key').value = settings.deepseek.apiKey || '';
                document.getElementById('deepseek-model').value = settings.deepseek.model || 'deepseek-chat';
            }

            // Set LiteLLM settings
            if (settings.litellm) {
                document.getElementById('litellm-key').value = settings.litellm.apiKey || '';
                // Load LiteLLM models first, then set the selected model
                await loadLiteLLMModels();
                const litellmModelElement = document.getElementById('litellm-model');
                if (litellmModelElement) {
                    litellmModelElement.value = settings.litellm.model || 'gpt-3.5-turbo';
                }
            } else {
                // Even if no settings exist, try to load cached models
                await loadLiteLLMModels();
            }
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Test the current provider configuration
async function testProviderConnection() {
    // Get the currently selected provider
    const selectedProvider = document.querySelector('input[name="provider-selection"]:checked')?.id;
    if (!selectedProvider) {
        showTestResult('请先选择一个AI提供商', 'error');
        return;
    }

    // Get the test button and change its text
    const testButton = document.getElementById('test-connection');
    const originalText = testButton.textContent;
    testButton.textContent = '测试中...';
    testButton.disabled = true;

    try {
        // Prepare test data based on the selected provider
        let testData = {};
        let testMessage = '这是一条测试消息，请回复"测试成功"';
        
        switch (selectedProvider) {
            case 'openai':
                testData = {
                    apiKey: document.getElementById('openai-key').value,
                    model: document.getElementById('openai-model').value,
                    messages: [
                        { role: "system", content: "You are a helpful assistant." },
                        { role: "user", content: testMessage }
                    ]
                };
                break;
            case 'anthropic':
                testData = {
                    apiKey: document.getElementById('anthropic-key').value,
                    model: document.getElementById('anthropic-model').value,
                    messages: [
                        { role: "user", content: testMessage }
                    ]
                };
                break;
            case 'gemini':
                testData = {
                    apiKey: document.getElementById('gemini-key').value,
                    model: document.getElementById('gemini-model').value,
                    systemPrompt: "You are a helpful assistant.",
                    userPrompt: testMessage
                };
                break;
            case 'deepseek':
                testData = {
                    apiKey: document.getElementById('deepseek-key').value,
                    model: document.getElementById('deepseek-model').value,
                    messages: [
                        { role: "system", content: "You are a helpful assistant." },
                        { role: "user", content: testMessage }
                    ]
                };
                break;
            case 'ollama':
                testData = {
                    model: document.getElementById('ollama-model').value,
                    messages: [
                        { role: "system", content: "You are a helpful assistant." },
                        { role: "user", content: testMessage }
                    ]
                };
                break;
            case 'litellm':
                testData = {
                    apiKey: document.getElementById('litellm-key').value,
                    model: document.getElementById('litellm-model').value,
                    messages: [
                        { role: "system", content: "You are a helpful assistant." },
                        { role: "user", content: testMessage }
                    ]
                };
                break;
            default:
                throw new Error(`未知的提供商: ${selectedProvider}`);
        }

        // Send test request to background script
        const response = await sendBackgroundMessage(`${selectedProvider.toUpperCase()}_API_REQUEST`, testData);
        
        console.log('测试响应:', response);
        
        // Check if the response is valid
        if (response) {
            let responseText = '';
            
            // Extract response text based on provider
            switch (selectedProvider) {
                case 'gemini':
                    if (response.candidates && response.candidates[0]?.content?.parts[0]?.text) {
                        responseText = response.candidates[0].content.parts[0].text;
                    }
                    break;
                case 'anthropic':
                    if (response.content && response.content[0]?.text) {
                        responseText = response.content[0].text;
                    }
                    break;
                case 'openai':
                case 'deepseek':
                case 'litellm':
                    if (response.choices && response.choices[0]?.message?.content) {
                        responseText = response.choices[0].message.content;
                    }
                    break;
            }
            
            if (responseText) {
                showTestResult(`连接测试成功!\n\n响应: ${responseText.substring(0, 100)}${responseText.length > 100 ? '...' : ''}`, 'success');
            } else {
                showTestResult(`连接成功，但响应格式不符合预期。请查看控制台获取详细信息。`, 'warning');
                console.error('响应格式不符合预期:', response);
            }
        } else {
            showTestResult('测试失败: 未收到响应', 'error');
        }
    } catch (error) {
        console.error('测试连接时出错:', error);
        showTestResult(`测试失败: ${error.message}`, 'error');
    } finally {
        // Reset button state
        testButton.textContent = originalText;
        testButton.disabled = false;
    }
}

// Function to show test result with visual feedback
function showTestResult(message, type) {
    // Create or update the test result element
    let resultElement = document.getElementById('test-result');
    if (!resultElement) {
        resultElement = document.createElement('div');
        resultElement.id = 'test-result';
        resultElement.className = 'mt-3 p-3 rounded-md text-sm';
        
        // Insert after the test button
        const testButton = document.getElementById('test-connection');
        testButton.parentNode.insertBefore(resultElement, testButton.nextSibling);
    }
    
    // Remove existing classes
    resultElement.className = 'mt-3 p-3 rounded-md text-sm';
    
    // Apply type-specific styling
    switch (type) {
        case 'success':
            resultElement.className += ' bg-green-50 text-green-800 border border-green-200';
            break;
        case 'error':
            resultElement.className += ' bg-red-50 text-red-800 border border-red-200';
            break;
        case 'warning':
            resultElement.className += ' bg-yellow-50 text-yellow-800 border border-yellow-200';
            break;
        default:
            resultElement.className += ' bg-gray-50 text-gray-800 border border-gray-200';
    }
    
    // Set the message
    resultElement.innerHTML = message.replace(/\n/g, '<br>');
    
    // Auto-hide after 10 seconds for success messages
    if (type === 'success') {
        setTimeout(() => {
            if (resultElement && resultElement.parentNode) {
                resultElement.remove();
            }
        }, 10000);
    }
}

// Initialize event listeners and load settings
document.addEventListener('DOMContentLoaded', async () => {
    // Load saved settings (this will also load Gemini models if needed)
    await loadSettings();

    // Add save button event listener
    const form = document.querySelector('form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveSettings();
    });

    // Add test connection button event listener
    const testButton = document.getElementById('test-connection');
    testButton.addEventListener('click', testProviderConnection);

    // Add refresh Gemini models button event listener
    const refreshGeminiButton = document.getElementById('refresh-gemini-models');
    refreshGeminiButton.addEventListener('click', async () => {
        const originalText = refreshGeminiButton.textContent;
        refreshGeminiButton.textContent = '刷新中...';
        refreshGeminiButton.disabled = true;
        
        try {
            await fetchGeminiModels();
            refreshGeminiButton.textContent = '已刷新';
            setTimeout(() => {
                refreshGeminiButton.textContent = originalText;
            }, 2000);
        } catch (error) {
            refreshGeminiButton.textContent = '刷新失败';
            setTimeout(() => {
                refreshGeminiButton.textContent = originalText;
            }, 3000);
        } finally {
            refreshGeminiButton.disabled = false;
        }
    });

    // Add refresh LiteLLM models button event listener
    const refreshLiteLLMButton = document.getElementById('refresh-litellm-models');
    refreshLiteLLMButton.addEventListener('click', async () => {
        const originalText = refreshLiteLLMButton.textContent;
        refreshLiteLLMButton.textContent = '刷新中...';
        refreshLiteLLMButton.disabled = true;
        
        try {
            await fetchLiteLLMModels();
            refreshLiteLLMButton.textContent = '已刷新';
            setTimeout(() => {
                refreshLiteLLMButton.textContent = originalText;
            }, 2000);
        } catch (error) {
            refreshLiteLLMButton.textContent = '刷新失败';
            setTimeout(() => {
                refreshLiteLLMButton.textContent = originalText;
            }, 3000);
        } finally {
            refreshLiteLLMButton.disabled = false;
        }
    });

    // Add cancel button event listener
    const cancelButton = document.querySelector('button[type="button"]:not(#test-connection):not(#refresh-gemini-models):not(#refresh-litellm-models)');
    cancelButton.addEventListener('click', () => {
        window.close();
    });

    // Add radio button change listeners to enable/disable corresponding inputs
    const radioButtons = document.querySelectorAll('input[name="provider-selection"]');
    radioButtons.forEach(radio => {
        radio.addEventListener('change', () => {
            // Enable/disable input fields based on selection
            const openaiInputs = document.querySelectorAll('#openai-key, #openai-model');
            const anthropicInputs = document.querySelectorAll('#anthropic-key, #anthropic-model');
            const geminiInputs = document.querySelectorAll('#gemini-key, #gemini-model');
            const deepseekInputs = document.querySelectorAll('#deepseek-key, #deepseek-model');
            const litellmInputs = document.querySelectorAll('#litellm-key, #litellm-model');

            openaiInputs.forEach(input => input.disabled = radio.id !== 'openai');
            anthropicInputs.forEach(input => input.disabled = radio.id !== 'anthropic');
            geminiInputs.forEach(input => input.disabled = radio.id !== 'gemini');
            deepseekInputs.forEach(input => input.disabled = radio.id !== 'deepseek');
            litellmInputs.forEach(input => input.disabled = radio.id !== 'litellm');
        });
    });

    // Initial trigger of radio button change event to set initial state
    const checkedRadio = document.querySelector('input[name="provider-selection"]:checked');
    if (checkedRadio) {
        checkedRadio.dispatchEvent(new Event('change'));
    } else {
        // 如果没有选中任何提供商，默认选择第一个
        const firstProvider = document.querySelector('input[name="provider-selection"]');
        if (firstProvider) {
            firstProvider.checked = true;
            firstProvider.dispatchEvent(new Event('change'));
        }
    }
});
