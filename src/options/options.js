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
    
    const providerSelection = document.querySelector('input[name="provider-selection"]:checked')?.id || 'ollama';
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
        ollama: {
            model: document.getElementById('ollama-model').value
        },
        openrouter: {
            apiKey: document.getElementById('openrouter-key').value,
            model: document.getElementById('openrouter-model').value
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

// Fetch Ollama models from API
async function fetchOllamaModels() {
    try {
        const data = await sendBackgroundMessage('FETCH_API_REQUEST', {
            url: 'http://localhost:11434/api/tags',
            method: 'GET'
        });

        const selectElement = document.getElementById('ollama-model');
        // Clear existing options
        selectElement.innerHTML = '';

        // Add models to select element
        data.models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.name;
            option.textContent = model.name;
            selectElement.appendChild(option);
        });

        // If no models found, add a placeholder option
        if (data.models.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No models available';
            selectElement.appendChild(option);
        }
    } catch (error) {
        console.log('Error fetching Ollama models:', error);
        // Handle error by adding an error option
        const selectElement = document.getElementById('ollama-model');
        selectElement.innerHTML = '';
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Error loading models';
        selectElement.appendChild(option);
    }
}

// Load settings from Chrome storage
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
                document.getElementById('gemini-model').value = settings.gemini.model || 'gemini-2.0-flash-lite';
            }

            // Set DeepSeek settings
            if (settings.deepseek) {
                document.getElementById('deepseek-key').value = settings.deepseek.apiKey || '';
                document.getElementById('deepseek-model').value = settings.deepseek.model || 'deepseek-chat';
            }

            // Set Ollama settings
            if (settings.ollama) {
                document.getElementById('ollama-model').value = settings.ollama.model || 'llama2';
            }

            // Set OpenRouter settings
            if (settings.openrouter) {
                document.getElementById('openrouter-key').value = settings.openrouter.apiKey || '';
                document.getElementById('openrouter-model').value = settings.openrouter.model || 'anthropic/claude-3.5-sonnet';
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
        alert('请先选择一个AI提供商');
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
            case 'openrouter':
                testData = {
                    apiKey: document.getElementById('openrouter-key').value,
                    model: document.getElementById('openrouter-model').value,
                    messages: [
                        { role: "system", content: "You are a helpful assistant." },
                        { role: "user", content: testMessage }
                    ]
                };
                break;
            case 'chrome-ai':
                testData = {
                    text: testMessage
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
                case 'openrouter':
                    if (response.choices && response.choices[0]?.message?.content) {
                        responseText = response.choices[0].message.content;
                    }
                    break;
                case 'ollama':
                    if (response.message && response.message.content) {
                        responseText = response.message.content;
                    }
                    break;
                case 'chrome-ai':
                    if (response.summary) {
                        responseText = response.summary;
                    }
                    break;
            }
            
            if (responseText) {
                alert(`连接测试成功!\n\n响应: ${responseText.substring(0, 100)}${responseText.length > 100 ? '...' : ''}`);
            } else {
                alert(`连接成功，但响应格式不符合预期。请查看控制台获取详细信息。`);
                console.error('响应格式不符合预期:', response);
            }
        } else {
            alert('测试失败: 未收到响应');
        }
    } catch (error) {
        console.error('测试连接时出错:', error);
        alert(`测试失败: ${error.message}`);
    } finally {
        // Reset button state
        testButton.textContent = originalText;
        testButton.disabled = false;
    }
}

// Initialize event listeners and load settings
document.addEventListener('DOMContentLoaded', async () => {
    // Fetch Ollama models before loading other settings
    await fetchOllamaModels();

    // Load saved settings
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

    // Add cancel button event listener
    const cancelButton = document.querySelector('button[type="button"]:not(#test-connection)');
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
            const ollamaInputs = document.querySelectorAll('#ollama-model');
            const openrouterInputs = document.querySelectorAll('#openrouter-key, #openrouter-model');

            openaiInputs.forEach(input => input.disabled = radio.id !== 'openai');
            anthropicInputs.forEach(input => input.disabled = radio.id !== 'anthropic');
            geminiInputs.forEach(input => input.disabled = radio.id !== 'gemini');
            deepseekInputs.forEach(input => input.disabled = radio.id !== 'deepseek');
            ollamaInputs.forEach(input => input.disabled = radio.id !== 'ollama');
            openrouterInputs.forEach(input => input.disabled = radio.id !== 'openrouter');
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
