/**
 * Handles author tracking functionality for the Hacker News Companion extension
 */
class AuthorTracking {
    constructor(enhancer) {
        this.enhancer = enhancer;
        this.authorComments = new Map();
        this.popup = this.createAuthorPopup();
        this.postAuthor = this.getPostAuthor();
    }

    /**
     * Creates a map of authors to their comments
     * @returns {Map<string, Element[]>} Map of authors to their comments
     */
    createAuthorCommentsMap() {
        const authorCommentsMap = new Map();

        // Get all comments in this post
        const comments = document.querySelectorAll('.athing.comtr');

        // Count comments by author and the author comments elements by author
        comments.forEach(comment => {
            // save the author comments mapping (comments from each user in this post)
            const authorElement = comment.querySelector('.hnuser');
            if (authorElement) {
                const author = authorElement.textContent;

                if (!authorCommentsMap.has(author)) {
                    authorCommentsMap.set(author, []);
                }
                authorCommentsMap.get(author).push(comment);
            }
        });

        this.authorComments = authorCommentsMap;
        return authorCommentsMap;
    }

    /**
     * Creates a popup for displaying author information
     * @returns {Element} The popup element
     */
    createAuthorPopup() {
        const popup = document.createElement('div');
        popup.className = 'author-popup';
        document.body.appendChild(popup);
        return popup;
    }

    /**
     * Gets the post author
     * @returns {string|null} The post author or null if not found
     */
    getPostAuthor() {
        const postAuthorElement = document.querySelector('.fatitem .hnuser');
        return postAuthorElement ? postAuthorElement.textContent : null;
    }

    /**
     * Injects author comments navigation links
     * @param {Element} comment - The comment element
     */
    injectAuthorCommentsNavLinks(comment) {
        const authorElement = comment.querySelector('.hnuser');
        if (authorElement && !authorElement.querySelector('.comment-count')) {
            const author = authorElement.textContent;
            const count = this.authorComments.get(author).length;

            const container = document.createElement('span');

            const countSpan = document.createElement('span');
            countSpan.className = 'comment-count';
            countSpan.textContent = `(${count})`;
            container.appendChild(countSpan);

            const navPrev = document.createElement('span');
            navPrev.className = 'author-nav nav-triangle';
            navPrev.textContent = '\u23F4';  // Unicode for left arrow '◀'
            navPrev.title = 'Go to previous comment by this author';
            navPrev.onclick = (e) => {
                e.preventDefault();
                this.navigateAuthorComments(author, comment, 'prev');
            };
            container.appendChild(navPrev);

            const navNext = document.createElement('span');
            navNext.className = 'author-nav nav-triangle';
            navNext.textContent = '\u23F5';   // Unicode for right arrow '▶'
            navNext.title = 'Go to next comment by this author';
            navNext.onclick = (e) => {
                e.preventDefault();
                this.navigateAuthorComments(author, comment, 'next');
            };
            container.appendChild(navNext);

            if (author === this.postAuthor) {
                const authorIndicator = document.createElement('span');
                authorIndicator.className = 'post-author';
                authorIndicator.textContent = '👑';
                authorIndicator.title = 'Post Author';
                container.appendChild(authorIndicator);
            }

            const separator = document.createElement("span");
            separator.className = "author-separator";
            separator.textContent = "|";
            container.appendChild(separator);

            // Get the parent element of the author element and append the container as second child
            authorElement.parentElement.insertBefore(container, authorElement.parentElement.children[1]);
        }
    }

    /**
     * Navigates to comments by the same author
     * @param {string} author - The author name
     * @param {Element} currentComment - The current comment element
     * @param {string} direction - The direction to navigate ('prev', 'next')
     */
    navigateAuthorComments(author, currentComment, direction) {
        const comments = this.authorComments.get(author);
        if (!comments) return;

        const currentIndex = comments.indexOf(currentComment);
        if (currentIndex === -1) return;

        let targetIndex;
        if (direction === 'prev') {
            targetIndex = currentIndex > 0 ? currentIndex - 1 : comments.length - 1;
        } else {
            targetIndex = currentIndex < comments.length - 1 ? currentIndex + 1 : 0;
        }

        const targetComment = comments[targetIndex];
        this.enhancer.navigation.setCurrentComment(targetComment);
    }

    /**
     * Sets up user hover functionality
     */
    setupUserHover() {
        document.querySelectorAll('.hnuser').forEach(authorElement => {
            authorElement.addEventListener('mouseenter', async (e) => {
                const username = e.target.textContent.replace(/[^a-zA-Z0-9_-]/g, '');
                const userInfo = await this.enhancer.apiClient.fetchUserInfo(username);

                if (userInfo) {
                    this.popup.innerHTML = `
                        <strong>${username}</strong><br>
                        Karma: ${userInfo.karma}<br>
                        About: ${userInfo.about}
                      `;

                    const rect = e.target.getBoundingClientRect();
                    this.popup.style.left = `${rect.left}px`;
                    this.popup.style.top = `${rect.bottom + window.scrollY + 5}px`;
                    this.popup.style.display = 'block';
                }
            });

            authorElement.addEventListener('mouseleave', () => {
                this.popup.style.display = 'none';
            });
        });

        // Add global event listeners to close the user popup on Esc key or click outside the user element
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.popup.style.display = 'none';
            }
        });

        // Add event listener for clicks outside the popup
        document.addEventListener('click', (e) => {
            if (!this.popup.contains(e.target) && !e.target.classList.contains('hnuser')) {
                this.popup.style.display = 'none';
            }
        });
    }
}

export default AuthorTracking;
