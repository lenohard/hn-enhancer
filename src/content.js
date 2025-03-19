import HNEnhancer from './hn-enhancer.js';

// This file is now just a wrapper that initializes the HNEnhancer
// All functionality has been moved to modular components

// Initialize the HNEnhancer. Note that we are loading this content script with the default run_at of 'document_idle'.
// So this script is injected only after the DOM is loaded and all other scripts have finished executing.
// This guarantees that the DOM of the main HN page is loaded by the time this script runs.
document.hnEnhancer = new HNEnhancer();
