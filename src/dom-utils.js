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
   * @returns {Array<{id: string, author: string, text: string, path: string, score: number, replies: number, downvotes: number, isTarget: boolean}>} 
   *          An array of enhanced comment objects, ordered from root parent to the target comment. Returns empty array on error.
   */
  static getCommentContext(targetCommentElement) {
    const context = [];
    if (!targetCommentElement) {
      console.error("getCommentContext: targetCommentElement is null");
      return context;
    }
    console.log("[DEBUG] getCommentContext: Starting context gathering for target:", targetCommentElement.id);

    let currentElement = targetCommentElement;
    const visitedIds = new Set(); // Prevent infinite loops in case of weird DOM structures
    const targetId = DomUtils.getCommentId(targetCommentElement);

    // First pass: gather all parent comments in reverse order (target to root)
    const reversedComments = [];
    
    while (currentElement) {
      const commentId = DomUtils.getCommentId(currentElement);
      
      // Prevent loops
      if (!commentId || visitedIds.has(commentId)) {
        if (visitedIds.has(commentId))
          console.warn(`getCommentContext: Loop detected at comment ID: ${commentId}`);
        else 
          console.warn("getCommentContext: Element missing ID:", currentElement);
        break;
      }
      visitedIds.add(commentId);

      const author = DomUtils.getCommentAuthor(currentElement);
      const text = DomUtils.getCommentText(currentElement);
      const downvotes = DomUtils.getDownvoteCount(currentElement.querySelector(".commtext")) || 0;
      
      // Get direct children to count replies
      const directChildren = DomUtils.getDirectChildComments(currentElement);
      const replyCount = directChildren.length;

      if (author !== null) {
        // Add to the reversed list with basic info
        reversedComments.push({ 
          id: commentId, 
          author, 
          text, 
          downvotes,
          replyCount,
          element: currentElement, // Keep reference for later processing
          isTarget: commentId === targetId
        });
      } else {
        console.warn("getCommentContext: Skipping comment due to missing author.", currentElement);
      }

      // Find parent link and navigate to parent
      const navsSpan = currentElement.querySelector('.comhead .navs');
      let parentLink = null;
      if (navsSpan) {
          const links = navsSpan.querySelectorAll('a');
          for (const link of links) {
              if (link.textContent.trim() === 'parent') {
                  parentLink = link;
                  break;
              }
          }
      }

      if (!parentLink) {
        console.log("[DEBUG] getCommentContext: No 'parent' link found for comment:", commentId);
        break;
      }

      const parentHref = parentLink.getAttribute("href");
      const parentIdMatch = parentHref.match(/#(\d+)/);
      if (!parentIdMatch || !parentIdMatch[1]) {
        console.warn("getCommentContext: Could not extract parent ID from href:", parentHref);
        break;
      }
      
      const parentId = parentIdMatch[1];
      const parentElement = DomUtils.findCommentElementById(parentId);
      if (!parentElement) {
        console.warn(`getCommentContext: Could not find parent element with ID: ${parentId}`);
        break;
      }

      currentElement = parentElement;
    }

    // Second pass: reverse the list and calculate paths and scores
    const totalComments = reversedComments.length;
    
    // Process in correct order (root to target)
    for (let i = reversedComments.length - 1; i >= 0; i--) {
      const comment = reversedComments[i];
      
      // Calculate path: for parents context, use simple numbering from root (1, 2, 3...)
      const path = String(totalComments - i);
      
      // Calculate score based on position (earlier = higher score)
      const position = totalComments - i - 1; // 0-based position from root
      const score = DomUtils.calculateCommentScore(position, totalComments, comment.downvotes);
      
      // Add the enhanced comment to the context array
      context.push({
        id: comment.id,
        author: comment.author,
        text: comment.text,
        path,
        score,
        replies: comment.replyCount,
        downvotes: comment.downvotes,
        isTarget: comment.isTarget
      });
    }

    console.log("[DEBUG] getCommentContext: Finished gathering context. Total items:", context.length);
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

  /**
   * Formats a comment for LLM consumption with metadata in a standardized format.
   * @param {Object} comment - The comment object with id, author, text properties.
   * @param {string} path - The hierarchical path of the comment (e.g., "1.2.3").
   * @param {number} replyCount - Number of direct replies to this comment.
   * @param {number} score - Normalized importance score (0-1000).
   * @param {number} downvotes - Number of downvotes or negative reactions.
   * @param {boolean} isTarget - Whether this is the target comment the user initiated chat from.
   * @returns {string} Formatted comment string.
   */
  static formatCommentForLLM(comment, path, replyCount = 0, score = 500, downvotes = 0, isTarget = false) {
    if (!comment || !comment.author) {
      return `[${path}] (score: ${score}) <replies: ${replyCount}> {downvotes: ${downvotes}} [unknown]: [missing content]`;
    }
    
    // Add a marker for the target comment if specified
    const targetMarker = isTarget ? " [TARGET]" : "";
    
    return `[${path}] (score: ${score}) <replies: ${replyCount}> {downvotes: ${downvotes}} ${comment.author}${targetMarker}: ${comment.text}`;
  }
  
  /**
   * Calculates a normalized score for a comment based on position and other factors.
   * @param {number} position - The position of the comment in the thread (0-based).
   * @param {number} totalComments - Total number of comments in the context.
   * @param {number} downvotes - Number of downvotes (default 0).
   * @returns {number} A normalized score between 0-1000.
   */
  static calculateCommentScore(position, totalComments, downvotes = 0) {
    const MAX_SCORE = 1000;
    const MAX_DOWNVOTES = 10;
    
    // Base score decreases with position
    const baseScore = Math.floor(MAX_SCORE - (position * MAX_SCORE) / Math.max(totalComments, 1));
    
    // Apply penalty for downvotes
    const penaltyPerDownvote = baseScore / MAX_DOWNVOTES;
    const penalty = penaltyPerDownvote * downvotes;
    
    return Math.max(Math.floor(baseScore - penalty), 0);
  }

  /**
   * Gets all direct child comments of a given parent comment with enhanced metadata.
   * @param {HTMLElement} parentComment - The parent comment element (TR.athing.comtr).
   * @returns {Array<{id: string, author: string, text: string, path: string, score: number, replies: number, downvotes: number, isTarget: boolean}>} 
   *          An array of enhanced direct child comment objects.
   */
  static getDirectChildCommentsWithMetadata(parentComment) {
    // First get the raw child elements
    const childElements = DomUtils.getDirectChildComments(parentComment);
    if (!childElements.length) {
      return [];
    }
    
    const targetId = DomUtils.getCommentId(parentComment);
    const enhancedChildren = [];
    
    // Process each child to add metadata
    childElements.forEach((childElement, index) => {
      const commentId = DomUtils.getCommentId(childElement);
      const author = DomUtils.getCommentAuthor(childElement);
      const text = DomUtils.getCommentText(childElement);
      
      if (!commentId || author === null) {
        console.warn("getDirectChildCommentsWithMetadata: Skipping child due to missing ID or author.", childElement);
        return; // Skip this iteration
      }
      
      // Get metadata
      const downvotes = DomUtils.getDownvoteCount(childElement.querySelector(".commtext")) || 0;
      const directChildren = DomUtils.getDirectChildComments(childElement);
      const replyCount = directChildren.length;
      
      // Calculate path: for direct children, use 1.1, 1.2, etc.
      const path = `1.${index + 1}`;
      
      // Calculate score based on position
      const score = DomUtils.calculateCommentScore(index, childElements.length, downvotes);
      
      enhancedChildren.push({
        id: commentId,
        author,
        text,
        path,
        score,
        replies: replyCount,
        downvotes,
        isTarget: false // None of the children are the target
      });
    });
    
    return enhancedChildren;
  }


  /**
   * Gathers all descendant comments (children, grandchildren, etc.) for a given comment.
   * Traverses down the comment tree based on indentation levels.
   * @param {HTMLElement} targetCommentElement - The comment element (TR.athing.comtr) to start from.
   * @returns {Array<{id: string, author: string, text: string, path: string, score: number, replies: number, downvotes: number, isTarget: boolean}>} 
   *          An array of enhanced descendant comment objects. Returns empty array on error or if no descendants.
   */
  static getDescendantComments(targetCommentElement) {
    const descendants = [];
    if (!targetCommentElement) {
      console.error("getDescendantComments: targetCommentElement is null");
      return descendants;
    }

    const targetRow = targetCommentElement.closest("tr");
    if (!targetRow) {
      console.error("getDescendantComments: Could not find target row for:", targetCommentElement.id);
      return descendants;
    }

    const targetIndent = DomUtils.getCommentIndentLevel(targetCommentElement);
    if (targetIndent === null) {
      console.error("getDescendantComments: Could not determine indent level for target:", targetCommentElement.id);
      return descendants;
    }

    const targetId = DomUtils.getCommentId(targetCommentElement);
    
    // First pass: gather all descendants with their indentation levels
    const rawDescendants = [];
    let currentRow = targetRow.nextElementSibling;

    while (currentRow) {
        let currentCommentElement = null;
        // Check if the row itself is the comment element
        if (currentRow.classList.contains("athing") && currentRow.classList.contains("comtr")) {
            currentCommentElement = currentRow;
        } else {
            // Fallback: look for the comment element within the row
            currentCommentElement = currentRow.querySelector(".athing.comtr");
        }

        if (!currentCommentElement) {
            // Not a comment row, could be 'more' link etc.
            currentRow = currentRow.nextElementSibling;
            continue;
        }

        const currentIndent = DomUtils.getCommentIndentLevel(currentCommentElement);

        if (currentIndent === null) {
            // Cannot determine indent, skip
            currentRow = currentRow.nextElementSibling;
            continue;
        }

        if (currentIndent > targetIndent) {
            // This is a descendant
            const commentId = DomUtils.getCommentId(currentCommentElement);
            const author = DomUtils.getCommentAuthor(currentCommentElement);
            const text = DomUtils.getCommentText(currentCommentElement);
            const downvotes = DomUtils.getDownvoteCount(currentCommentElement.querySelector(".commtext")) || 0;
            
            // Get direct children to count replies
            const directChildren = DomUtils.getDirectChildComments(currentCommentElement);
            const replyCount = directChildren.length;

            if (commentId && author !== null) {
                rawDescendants.push({ 
                  id: commentId, 
                  author, 
                  text, 
                  indentLevel: currentIndent - targetIndent, // Relative indent level
                  downvotes,
                  replyCount,
                  element: currentCommentElement
                });
            } else {
                console.warn("getDescendantComments: Skipping descendant due to missing ID or author.", currentCommentElement);
            }
        } else {
            // Indentation is equal or less, so we've exited the descendant tree of the target
            break;
        }

        currentRow = currentRow.nextElementSibling;
    }

    // Second pass: build the tree structure to calculate paths
    const totalComments = rawDescendants.length;
    
    // Build a map of parent-child relationships based on indentation
    const childrenMap = new Map(); // Maps parent index to array of child indices
    
    // Initialize with empty arrays for all comments
    for (let i = 0; i < totalComments; i++) {
      childrenMap.set(i, []);
    }
    
    // For each comment, find its parent based on indentation
    for (let i = 0; i < totalComments; i++) {
      const currentIndent = rawDescendants[i].indentLevel;
      
      // Look backwards for the closest comment with one level less indentation
      for (let j = i - 1; j >= 0; j--) {
        if (rawDescendants[j].indentLevel === currentIndent - 1) {
          childrenMap.get(j).push(i);
          break;
        }
      }
    }
    
    // Function to recursively build paths
    function buildDescendantPaths(index, basePath, level = 1) {
      const comment = rawDescendants[index];
      const childIndices = childrenMap.get(index);
      
      // Calculate path: for descendants, use 1.1, 1.2, etc. format
      const path = basePath ? `${basePath}.${level}` : `1.${level}`;
      
      // Calculate score based on position and indentation
      const score = DomUtils.calculateCommentScore(index, totalComments, comment.downvotes);
      
      // Add the enhanced comment to the descendants array
      descendants.push({
        id: comment.id,
        author: comment.author,
        text: comment.text,
        path,
        score,
        replies: comment.replyCount,
        downvotes: comment.downvotes,
        isTarget: false // None of the descendants are the target
      });
      
      // Process children recursively
      childIndices.forEach((childIndex, i) => {
        buildDescendantPaths(childIndex, path, i + 1);
      });
    }
    
    // Process all top-level descendants (direct children of target)
    const topLevelDescendants = rawDescendants
      .map((_, index) => index)
      .filter(index => rawDescendants[index].indentLevel === 1);
    
    topLevelDescendants.forEach((index, i) => {
      buildDescendantPaths(index, "1", i + 1);
    });

    return descendants;
  }
    
  /**
   * Gets all direct child comments of a given parent comment.
   * @param {HTMLElement} parentComment - The parent comment element (TR.athing.comtr).
   * @returns {Array<HTMLElement>} An array of direct child comment elements.
   */
  static getDirectChildComments(parentComment) {
    const children = [];
    if (!parentComment) {
      console.error("getDirectChildComments: parentComment is null");
      return children;
    }
    
    const parentRow = parentComment.closest("tr");
    if (!parentRow) {
      console.error("getDirectChildComments: Could not find parent row for:", parentComment.id);
      return children;
    }
    
    const parentIndent = DomUtils.getCommentIndentLevel(parentComment);
    if (parentIndent === null) {
      console.error("getDirectChildComments: Could not determine indent level for parent:", parentComment.id);
      return children;
    }
    
    let currentRow = parentRow.nextElementSibling;
    
    while (currentRow) {
      let currentCommentElement = null;
      // Check if the row itself is the comment element
      if (currentRow.classList.contains("athing") && currentRow.classList.contains("comtr")) {
          currentCommentElement = currentRow;
      } else {
          // Fallback: look for the comment element within the row
          currentCommentElement = currentRow.querySelector(".athing.comtr");
      }
    
      if (!currentCommentElement) {
        // Not a comment row, could be 'more' link etc.
        currentRow = currentRow.nextElementSibling;
        continue;
      }
    
      const currentIndent = DomUtils.getCommentIndentLevel(currentCommentElement);
    
      if (currentIndent === null) {
        // Cannot determine indent, skip
        currentRow = currentRow.nextElementSibling;
        continue;
      }
    
      if (currentIndent === parentIndent + 1) {
        // This is a direct child
        children.push(currentCommentElement);
      } else if (currentIndent <= parentIndent) {
        // We've reached a sibling of the parent or an element higher up the tree
        break;
      }
      // If currentIndent > parentIndent + 1, it's a grandchild or deeper, so skip
    
      currentRow = currentRow.nextElementSibling;
    }
    
    return children;
  }
    
}
    
// Make the class available globally
window.DomUtils = DomUtils;
