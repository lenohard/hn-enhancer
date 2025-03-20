/**
 * Navigation functionality for the Hacker News Companion extension
 */
class Navigation {
    constructor(enhancer) {
        this.enhancer = enhancer;
    }

    /**
     * Navigates to a post in the specified direction
     * @param {string} direction - The direction to navigate ('first', 'next', 'prev')
     */
    navigateToPost(direction) {
        switch (direction) {
            case 'first':
                if(this.enhancer.allPosts.length > 0) {
                    this.setCurrentPostIndex(0);
                }
                break;
            case 'next':
                const nextPostIndex = this.enhancer.currentPostIndex + 1;
                if(nextPostIndex < this.enhancer.allPosts.length) {
                    this.setCurrentPostIndex(nextPostIndex);
                } else {
                    this.enhancer.logDebug(`Currently at the last post, cannot navigate further to next post.`);
                }
                break;
            case 'prev':
                const prevPostIndex = this.enhancer.currentPostIndex - 1;
                if(prevPostIndex >= 0) {
                    this.setCurrentPostIndex(prevPostIndex);
                } else {
                    this.enhancer.logDebug(`Currently at the first post, cannot navigate further to previous post.`);
                }
                break;
            default:
                console.error(`Cannot navigate to post. Unknown direction: ${direction}`);
                break;
        }
    }

    /**
     * Gets the current post element
     * @returns {Element|null} The current post element or null if not available
     */
    getCurrentPost() {
        if(this.enhancer.currentPostIndex < 0 || this.enhancer.currentPostIndex >= this.enhancer.allPosts.length){
            this.enhancer.logInfo(`No current post to return, because current post index is outside the bounds of the posts array.
                            currentPostIndex: ${this.enhancer.currentPostIndex}. allPosts.length: ${this.enhancer.allPosts.length}`);
            return null;
        }

        return this.enhancer.allPosts[this.enhancer.currentPostIndex];
    }

    /**
     * Sets the current post index and highlights the post
     * @param {number} postIndex - The index of the post to set as current
     */
    setCurrentPostIndex(postIndex) {
        if(!this.enhancer.allPosts) return;

        if(this.enhancer.allPosts.length === 0) {
            this.enhancer.logDebug(`No posts in this page, hence not setting the current post.`);
            return;
        }
        if(postIndex < 0 || postIndex >= this.enhancer.allPosts.length) {
            console.error(`ERROR: cannot set current post because the given index is outside the bounds of the posts array.
                            postIndex: ${postIndex}. allPosts.length: ${this.enhancer.allPosts.length}`);
            return;
        }

        // un-highlight the current post before updating the post index.
        if(this.enhancer.currentPostIndex >= 0) {
            const prevPost = this.enhancer.allPosts[this.enhancer.currentPostIndex];
            prevPost.classList.remove('highlight-post')
        }

        // update the post index if there is a valid post at that index
        const newPost = this.enhancer.allPosts[postIndex];
        if(!newPost) {
            console.error(`Post at the new index is null. postIndex: ${postIndex}`);
            return;
        }

        this.enhancer.currentPostIndex = postIndex;
        this.enhancer.logDebug(`Updated current post index to ${postIndex}`);

        // save the id of the new post as the last seen post id in the storage
        const newPostId = this.enhancer.domUtils.getPostId(newPost);
        if(newPostId) {
            this.enhancer.hnState.saveLastSeenPostId(newPostId);
            this.enhancer.logDebug(`Saved current post id as last seen post id: ${newPostId}`);
        }

        // highlight the new post and scroll to it
        newPost.classList.add('highlight-post');
        newPost.scrollIntoView({behavior: 'smooth', block: 'center'});
    }

    /**
     * Navigates to the first comment
     * @param {boolean} scrollToComment - Whether to scroll to the comment
     */
    navigateToFirstComment(scrollToComment = true) {
        const firstComment = document.querySelector('.athing.comtr');
        if (firstComment) {
            this.setCurrentComment(firstComment, scrollToComment);
        }
    }

    /**
     * Navigates to the next child comment
     */
    navigateToChildComment() {
        if (!this.enhancer.currentComment) return;

        // The comments are arranged as a flat array of table rows where the hierarchy is represented by the depth of the element.
        //  So the next child is the next comment element in the array.
        let next = this.enhancer.currentComment.nextElementSibling;

        while (next) {
            // Look for the element with the style classes of comment. If found, return. If not, continue to the next sibling.
            if (next.classList.contains('athing') && next.classList.contains('comtr')) {
                this.setCurrentComment(next);
                return; // Found the next child
            }
            next = next.nextElementSibling;
        }
    }

    /**
     * Gets a navigation element by name
     * @param {Element} comment - The comment element
     * @param {string} elementName - The name of the navigation element ('root', 'parent', 'next', 'prev')
     * @returns {Element|undefined} The navigation element or undefined if not found
     */
    getNavElementByName(comment, elementName) {
        if (!comment) return;

        // Get HN's default navigation panel and locate the nav element by the given name ('root', 'parent', 'next' or 'prev').
        const hyperLinks = comment.querySelectorAll('.comhead .navs a');
        if (hyperLinks) {
            // Find the <a href> with text that matches the given name
            const hyperLink = Array.from(hyperLinks).find(a => a.textContent.trim() === elementName);
            if (hyperLink) {
                const commentId = hyperLink.hash.split('#')[1];
                const element = document.getElementById(commentId);
                return element;
            }
        }
    }

    /**
     * Sets the current comment and highlights it
     * @param {Element} comment - The comment element to set as current
     * @param {boolean} scrollIntoView - Whether to scroll to the comment
     */
    setCurrentComment(comment, scrollIntoView = true) {
        if (!comment) return;

        // Un-highlight the current comment's author before updating the current comment.
        //  Note: when this method is called the first time, this.currentComment will be null and it is ok.
        if(this.enhancer.currentComment) {
            const prevAuthorElement = this.enhancer.currentComment.querySelector('.hnuser');
            if (prevAuthorElement) {
                prevAuthorElement.classList.remove('highlight-author');
            }
        }

        // update the current comment
        this.enhancer.currentComment = comment;

        // Highlight the new comment's author
        const newAuthorElement = comment.querySelector('.hnuser');
        if (newAuthorElement) {
            newAuthorElement.classList.add('highlight-author');
        }

        // Scroll to the new comment element if asked for. Scroll to the center of the page instead of the top
        //   so that we can see a little bit of the previous comments.
        if (scrollIntoView) {
            comment.scrollIntoView({behavior: 'smooth', block: 'center'});
        }
    }

    /**
     * Customizes the default navigation links to use our navigation
     * @param {Element} comment - The comment element
     */
    customizeDefaultNavLinks(comment) {
        const hyperLinks = comment.querySelectorAll('.comhead .navs a');
        if (!hyperLinks) return;

        // Find the <a href> with text that have a hash ('#<comment_id>') and add click event listener
        const navLinks = Array.from(hyperLinks).filter(link => link.hash.length > 0);

        navLinks.forEach(link => {
            link.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation(); // stop the default link navigation

                const targetComment = this.getNavElementByName(comment, link.textContent.trim());
                if (targetComment) {
                    this.setCurrentComment(targetComment);
                }
            };
        });
    }

}

// Make the class available globally
window.Navigation = Navigation;
