// dom-utils.js
class DomUtils {
  /**
   * Gets the post ID from a post element.
   * @param {HTMLElement} post - The post element.
   * @returns {string|null} The post ID or null if not found.
   */
  static getPostId(post) {
    const linkElement = post.querySelector(".athing .title a.storylink");
    if (!linkElement) {
      return null;
    }
    const href = linkElement.getAttribute("href");
    const params = new URLSearchParams(href);
    return params.get("id");
  }

  static getCurrentHNItemId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("id");
  }

  /**
   * Gets the indentation level of a comment element.
   * HN uses a 40px width spacer image for each level of indentation.
   * @param {HTMLElement} commentElement - The comment element (usually the TR.athing.comtr).
   * @returns {number|null} The indentation level (0 for top-level) or null if it cannot be determined.
   */
  static getCommentIndentLevel(commentElement) {
    if (!commentElement) {
      console.warn("getCommentIndentLevel called with null element");
      return null;
    }
    // Ensure we are working with the TR element if a child was passed
    const commentRow =
      commentElement.closest("tr.athing.comtr") || commentElement;

    const indentElement = commentRow.querySelector(".ind img");
    if (!indentElement) {
      // Check if it's a comment row at all. If it has an ID, assume it's level 0 if no indent img.
      // Otherwise, it might not be a comment row.
      return commentRow.id ? 0 : null;
    }

    const widthAttr = indentElement.getAttribute("width");
    if (widthAttr === null) {
      console.warn(
        "Indent image found but missing width attribute for comment:",
        commentRow.id
      );
      return null; // Cannot determine level
    }

    const width = parseInt(widthAttr, 10);
    if (isNaN(width)) {
      console.warn(
        "Indent image width attribute is not a number:",
        widthAttr,
        "for comment:",
        commentRow.id
      );
      return null; // Cannot determine level
    }

    // HN uses 40px width per indent level.
    return Math.round(width / 40);
  }

  static getDownvoteCount(commentTextDiv) {
    const downvoteSpan = commentTextDiv.querySelector(".downvotes");
    if (!downvoteSpan) {
      return 0; // or null, or handle as appropriate
    }

    const countText = downvoteSpan.textContent.trim();
    const num = parseInt(countText, 10);
    return isNaN(num) ? 0 : num;
  }

  static getUpvoteCount(commentElement) {
    const scoreElement = commentElement.querySelector(".score");
    if (!scoreElement) {
      return 0;
    }
    const scoreText = scoreElement.textContent.trim();
    const pointsMatch = scoreText.match(/(\d+)\s+points?/);
    if (pointsMatch && pointsMatch[1]) {
      const num = parseInt(pointsMatch[1], 10);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  }

  /**
   * Gets the comment ID from a comment element.
   * @param {HTMLElement} commentElement - The comment element (TR.athing.comtr).
   * @returns {string|null} The comment ID or null if not found.
   */
  static getCommentId(commentElement) {
    if (!commentElement) return null;
    // Ensure we are targeting the TR element
    const commentRow =
      commentElement.closest("tr.athing.comtr") || commentElement;
    return commentRow.id || null;
  }

  /**
   * Gets the author (username) of a comment element.
   * @param {HTMLElement} commentElement - The comment element (TR.athing.comtr).
   * @returns {string|null} The author's username or null if not found.
   */
  static getCommentAuthor(commentElement) {
    if (!commentElement) return null;
    const authorElement = commentElement.querySelector(".hnuser");
    return authorElement ? authorElement.textContent.trim() : null;
  }

  /**
   * Gets the text content of a comment element.
   * @param {HTMLElement} commentElement - The comment element (TR.athing.comtr).
   * @returns {string} The comment text, or an empty string if not found.
   */
  static getCommentText(commentElement) {
    if (!commentElement) return "";
    const commentTextElement = commentElement.querySelector(".commtext");
    // Use innerText to handle <p> tags etc. better than textContent
    // It also roughly approximates what the user sees, excluding hidden elements.
    return commentTextElement ? commentTextElement.innerText.trim() : "";
  }

  /**
   * Finds a comment element (TR.athing.comtr) by its ID.
   * @param {string} commentId - The ID of the comment to find.
   * @returns {HTMLElement|null} The comment element or null if not found.
   */
  static findCommentElementById(commentId) {
    if (!commentId) return null;
    // HN IDs are typically numeric, so direct ID selection should work.
    return document.getElementById(commentId);
  }

  /**
   * Gathers the context for a given comment, including itself and all its parents.
   * Traverses up the comment tree using the 'parent' links.
   * @param {HTMLElement} targetCommentElement - The comment element (TR.athing.comtr) to start from.
   * @returns {Array<{id: string, author: string, text: string}>} An array of comment objects, ordered from root parent to the target comment. Returns empty array on error.
   */
  static getCommentContext(targetCommentElement) {
    const context = [];
    if (!targetCommentElement) {
      console.error("getCommentContext: targetCommentElement is null");
      return context;
    }
    console.log("[DEBUG] getCommentContext: Starting context gathering for target:", targetCommentElement.id); // Added log

    let currentElement = targetCommentElement;
    const visitedIds = new Set(); // Prevent infinite loops in case of weird DOM structures

    while (currentElement) {
      const commentId = DomUtils.getCommentId(currentElement);
      console.log("[DEBUG] getCommentContext: Processing element:", commentId); // Added log

      // Prevent loops
      if (!commentId || visitedIds.has(commentId)) {
        if (visitedIds.has(commentId))
          console.warn(
            `getCommentContext: Loop detected at comment ID: ${commentId}`
          );
        else console.warn("getCommentContext: Element missing ID:", currentElement); // Added log
        break;
      }
      visitedIds.add(commentId);

      const author = DomUtils.getCommentAuthor(currentElement);
      const text = DomUtils.getCommentText(currentElement);

      if (author !== null) {
        // Only need author and text for context display
        context.unshift({ id: commentId, author: author, text: text }); // Add to the beginning
        console.log("[DEBUG] getCommentContext: Added comment to context:", { id: commentId, author: author }); // Added log
      } else {
        console.warn(
          "getCommentContext: Skipping comment due to missing author.",
          currentElement
        );
      }

      // Find the 'parent' link within the current comment's metadata (.comhead .navs)
      console.log("[DEBUG] getCommentContext: Searching for parent link inside element:", currentElement.id, "HTML:", currentElement.innerHTML.substring(0, 250) + "..."); // Added log

      const navsSpan = currentElement.querySelector('.comhead .navs');
      let parentLink = null;
      if (navsSpan) {
          const links = navsSpan.querySelectorAll('a');
          for (const link of links) {
              // Find the link with the exact text "parent"
              if (link.textContent.trim() === 'parent') {
                  parentLink = link;
                  break;
              }
          }
      }

      if (!parentLink) {
        console.log("[DEBUG] getCommentContext: No 'parent' link found within .comhead .navs for comment:", commentId, ". Stopping traversal."); // Updated log
        break; // No parent link found, must be a top-level comment or structure changed
      }
      console.log("[DEBUG] getCommentContext: Found parent link:", parentLink.href); // Added log

      // Extract the parent comment ID from the link's href (which should be like "#12345")
      const parentHref = parentLink.getAttribute("href");
      // Updated regex to match the anchor format #ID
      const parentIdMatch = parentHref.match(/#(\d+)/);
      if (!parentIdMatch || !parentIdMatch[1]) {
        console.warn(
          "getCommentContext: Could not extract parent ID from parent link href:",
          parentHref
        );
        break; // Cannot proceed without parent ID
      }
      const parentId = parentIdMatch[1];
      console.log("[DEBUG] getCommentContext: Extracted parent ID:", parentId); // Added log

      // Find the parent element by ID
      const parentElement = DomUtils.findCommentElementById(parentId); // Renamed variable for clarity
      if (!parentElement) {
        console.warn(
          `getCommentContext: Could not find parent element with ID: ${parentId}. Stopping traversal.` // Added log
        );
        // Attempt to find parent by traversing siblings upwards (more robust but complex) - Future enhancement?
        break; // Parent element not found in DOM, stop traversal
      }
      console.log("[DEBUG] getCommentContext: Found parent element:", parentElement.id); // Added log

      // Set currentElement for the next iteration
      currentElement = parentElement;

    } // End of while loop

    console.log("[DEBUG] getCommentContext: Finished gathering context. Total items:", context.length); // Added log
    return context;
  }

  static calculateCommentStatistics() {
    const allCommentRows = document.querySelectorAll("tr.athing.comtr");
    if (!allCommentRows.length) {
      // Return empty arrays if no comments found
      return {
        topDeepest: [],
        topMostDirectReplies: [], // Renamed from topMostComments
        topLongest: [],
      };
    }

    const commentData = new Map(); // Store data per comment ID { id: { id, element, depth, textLength, upvotes, parentId, descendantCount } }
    const tree = {}; // Store tree structure { id: { data: {...}, children: [ids...] } }

    // --- Pass 1: Gather basic info and build node map ---
    allCommentRows.forEach((commentRow) => {
      const commentId = commentRow.id;
      if (!commentId) return; // Skip if no ID

      const commentTextDiv = commentRow.querySelector(".commtext");
      const indentElement = commentRow.querySelector(".ind img");
      // HN uses 40px width per indent level. No indent means depth 0.
      const depth = indentElement
        ? Math.round(parseInt(indentElement.getAttribute("width"), 10) / 40)
        : 0;
      const upvotes = DomUtils.getUpvoteCount(commentRow); // Keep upvotes for potential future use, but won't be in top 5 result
      const commentText = commentTextDiv
        ? commentTextDiv.textContent.trim()
        : "";

      const data = {
        id: commentId,
        element: commentRow, // Keep element reference if needed elsewhere, but link is primary for stats
        depth: depth,
        textLength: commentText.length,
        upvotes: upvotes,
        parentId: null, // Determined in Pass 2
        descendantCount: 0, // Calculated in Pass 3
      };
      commentData.set(commentId, data);
      tree[commentId] = { data: data, children: [] }; // Initialize tree node
    });

    // --- Pass 2: Build Tree Structure (Determine Parent/Child Relationships) ---
    const commentList = Array.from(commentData.values());
    // Assumes querySelectorAll returns elements in DOM order, which is generally true
    for (let i = 0; i < commentList.length; i++) {
      const currentComment = commentList[i];
      // Find the closest preceding comment with a lesser depth
      for (let j = i - 1; j >= 0; j--) {
        const potentialParent = commentList[j];
        if (potentialParent.depth < currentComment.depth) {
          currentComment.parentId = potentialParent.id;
          if (tree[potentialParent.id]) {
            // Check parent exists before pushing
            tree[potentialParent.id].children.push(currentComment.id);
          }
          break; // Found the immediate parent
        }
      }
    }

    // --- Pass 3: Calculate Descendant Counts ---
    const calculatedNodes = new Set(); // Keep track of nodes whose descendants have been counted

    function countDescendants(nodeId) {
      if (calculatedNodes.has(nodeId)) {
        return tree[nodeId].data.descendantCount; // Return cached count
      }

      const node = tree[nodeId];
      if (!node || !node.children.length) {
        if (node) calculatedNodes.add(nodeId); // Mark leaf node as calculated
        return 0; // Base case: no children
      }

      let count = node.children.length; // Count direct children
      node.children.forEach((childId) => {
        count += countDescendants(childId); // Recursively count grandchildren etc.
      });

      node.data.descendantCount = count; // Store the calculated count
      calculatedNodes.add(nodeId); // Mark as calculated
      return count;
    }

    // Calculate counts for all nodes by iterating through the list
    commentList.forEach((comment) => {
      if (!calculatedNodes.has(comment.id)) {
        countDescendants(comment.id); // This will recursively calculate up the chain if needed
      }
    });

    // --- Pass 4: Sort and Extract Top 5 ---

    const formatResult = (comment) => ({
      value: null, // Placeholder, will be set below
      link: `#${comment.id}`,
    });

    // Top 5 Deepest LEAF Nodes
    // Filter for all leaf nodes (comments with no children/replies)
    const leafNodes = commentList.filter((comment) => {
      const node = tree[comment.id];
      // Ensure the node exists in the tree and has no children
      return node && (!node.children || node.children.length === 0);
    });

    // Sort the leaf nodes primarily by depth (descending),
    // then by text length (descending) as a tie-breaker.
    const sortedLeafNodes = leafNodes.sort(
      (a, b) => b.depth - a.depth || b.textLength - a.textLength
    );

    // Take the top 5 deepest leaf nodes
    const topDeepest = sortedLeafNodes.slice(0, 5).map((c) => ({
      ...formatResult(c),
      value: c.depth, // The value displayed is the depth
    }));

    // Top 5 Most Direct Replies
    const sortedByDirectReplies = [...commentList].sort((a, b) => {
      const childrenA = tree[a.id]?.children?.length || 0;
      const childrenB = tree[b.id]?.children?.length || 0;
      return childrenB - childrenA;
    });
    const topMostDirectReplies = sortedByDirectReplies.slice(0, 5).map((c) => ({
      ...formatResult(c),
      value: tree[c.id]?.children?.length || 0, // Direct children count
    }));

    // Top 5 Longest Comments
    const sortedByLength = [...commentList].sort(
      (a, b) => b.textLength - a.textLength
    );
    const topLongest = sortedByLength.slice(0, 5).map((c) => ({
      ...formatResult(c),
      value: c.textLength, // Text length
    }));

    // --- Return the top 5 lists ---
    return {
      topDeepest: topDeepest,
      topMostDirectReplies: topMostDirectReplies, // Use the new name
      topLongest: topLongest,
    };
  }

  /**
   * Gets the main post title from the page.
   * @returns {string|null} The post title or null if not found.
   */
  static getHNPostTitle() {
    // The title link is usually within td.title > span.titleline > a
    const titleElement = document.querySelector(
      "td.title > span.titleline > a"
    );
    return titleElement ? titleElement.textContent.trim() : null;
  }
}

// Make the class available globally
window.DomUtils = DomUtils;
