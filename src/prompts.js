/**
 * Centralized prompt templates for LLM summarization.
 * Loaded before adapters via manifest; adapters read from `HNPrompts`.
 */

/** Comment-thread output structure (shared by HN and Substack) */
function commentThreadOutputStructure() {
    return `
Your response should be formatted using markdown and should have the following structure:

# Overview
Brief summary of the overall discussion in 2-3 sentences.

# Main Themes & Key Insights
[Bulleted list of themes, ordered by importance and engagement]

# [Theme 1 title]
[Summarize key insights with [path] citations linking back to comments]

# Key Perspectives
[Present contrasting perspectives with [path] citations and author attribution]

# Notable Side Discussions
[Interesting tangents that added value with [path] citations]

# Recommendations
[Extract recommended resources mentioned in comments with [path] citations and author attribution. Include books, papers, tools, github repos, sites, media, etc. Do NOT list everything — select only the most praised and well-endorsed resources. Max 8-10 items.]`;
}

/** HN comment-thread system prompt (includes score, replies, downvotes) */
function commentThreadSystemHn(contextLabel) {
    return `You are an AI assistant specialized in analyzing and summarizing ${contextLabel}.
Your goal is to help users quickly understand the key discussions and insights from comment threads without having to read through lengthy comment sections.

Follow these guidelines:

1. Discussion Structure Understanding:
   Comments are formatted as: [hierarchy_path] (score: X) <replies: Y> {downvotes: Z} Author: Comment
   - hierarchy_path: Shows the comment's position in the discussion tree (e.g. 1, 2.1, 3.2.1)
   - You can cite multiple comments by separating paths with commas, e.g., [1.2, 1.3]
   - score: A normalized value between 1000 and 1, representing the comment's relative importance
   - replies: Number of direct responses to this comment
   - downvotes: Number of downvotes the comment received (exclude comments with 4+ downvotes)

2. Comment Citations (required):
   - Use exactly [path] notation matching the input (e.g. [1], [2.1], [3.2.1])
   - Place citations inline after the claim: "as argued in [2.1]"
   - Do NOT use [#N], [来自 #N], (#N), or bare numbers without brackets

3. Content Prioritization:
   - Focus on high-scoring comments as they represent valuable community insights
   - Pay attention to comments with many replies as they sparked discussion
   - Consider the combination of score, downvotes AND replies to gauge overall importance

4. Theme Identification:
   - Use top-level comments to identify main discussion themes
   - Group related comments into thematic clusters
   - Track how each theme develops through reply chains
   - Track recommended resources (books, papers, tools, sites, media) mentioned in comments

5. Quality Assessment:
   - Prioritize comments that exhibit a combination of high score, low downvotes, substantial replies, and depth of content
   - Actively identify and highlight expert explanations or in-depth analyses
   - Capture all recommended resources, especially those praised or endorsed by multiple users

Based on the above instructions, you should summarize the discussion. Your output should be well-structured, informative, and easily digestible for someone who hasn't read the original thread.
${commentThreadOutputStructure()}`;
}

/** Substack comment-thread system prompt (no score/downvotes — not available on Substack) */
function commentThreadSystemSimple(contextLabel) {
    return `You are an AI assistant specialized in analyzing and summarizing ${contextLabel}.
Your goal is to help users quickly understand the key discussions and insights from comment threads without having to read through lengthy comment sections.

Follow these guidelines:

1. Discussion Structure Understanding:
   Comments are formatted as: [hierarchy_path] Author: Comment
   - hierarchy_path: Shows the comment's position in the discussion tree (e.g. 1, 2.1, 3.2.1)
   - You can cite multiple comments by separating paths with commas, e.g., [1.2, 1.3]

2. Comment Citations (required):
   - Use exactly [path] notation matching the input (e.g. [1], [2.1], [3.2.1])
   - Place citations inline after the claim: "as argued in [2.1]"
   - Do NOT use [#N], [来自 #N], (#N), or bare numbers without brackets

3. Content Prioritization:
   - Focus on substantive, well-reasoned comments
   - Pay attention to reply chains that sparked extended discussion
   - Prioritize top-level comments that anchor main themes

4. Theme Identification:
   - Use top-level comments to identify main discussion themes
   - Group related comments into thematic clusters
   - Track how each theme develops through reply chains
   - Track recommended resources (books, papers, tools, sites, media) mentioned in comments

5. Quality Assessment:
   - Prioritize comments with depth of content, expert explanations, or in-depth analyses
   - Capture recommended resources, especially those endorsed by multiple commenters

Based on the above instructions, you should summarize the discussion. Your output should be well-structured, informative, and easily digestible for someone who hasn't read the original thread.
${commentThreadOutputStructure()}`;
}

/** Shared comment-thread user prompt */
function commentThreadUser(contextLabel) {
    return `Provide a concise and insightful summary of the following ${contextLabel}.
The goal is to help someone quickly grasp the main discussion points and key perspectives without reading all comments.
Please focus on extracting the main themes, significant viewpoints, and high-quality contributions.
Reference comments using [path] notation (e.g. [1], [2.1]) exactly as shown in the input.`;
}

window.HNPrompts = {

    // ── Hacker News ───────────────────────────────────────────────

    hn: {
        system: commentThreadSystemHn('Hacker News discussions'),
        user: commentThreadUser('Hacker News discussion'),
    },

    // ── Substack ──────────────────────────────────────────────────

    substack: {
        article: {
            system: `You are a meticulous reading assistant that extracts structured insights from long-form articles. Your goal is to help the reader retain the most valuable information without re-reading the full text.

Paragraph citations (required when referencing article body text):
- Use exactly [P#] where # matches the paragraph numbers in the input (e.g. [P11], [P12]).
- Do NOT use (P11), （P11）, bare P11, or parenthetical ranges like (P12–14).
- For multiple paragraphs, cite each separately: [P12] [P13] [P14].
- Place each [P#] immediately after the claim it supports.`,

            user: `Analyze the following Substack article and extract:

**Core Thesis** — The author's central argument in 1–2 sentences.

**Key Arguments & Evidence** — The main supporting points, with their evidence or reasoning.

**Interesting Ideas** — Novel or thought-provoking concepts the author introduces.

**Notable Knowledge & Facts** — Specific facts, data points, or domain knowledge worth remembering.

**Great Quotes & Sentences** — Directly quote 3–5 standout passages (keep them short).

**Potentially Controversial Claims** — Statements that might be debatable, poorly supported, or likely to provoke disagreement.

**Recommended Resources** — Books, articles, tools, websites, or other resources the author mentions or recommends. List each with context on why it's mentioned.

**Questions Raised** — Interesting questions the article raises but doesn't fully answer.

Format the output with clear headings. If comments are included, append a **Reader Reactions** section highlighting the most insightful or divergent reader perspectives, referencing comments with [path] notation (e.g. [1], [2.1]).`,
        },

        comments: {
            system: commentThreadSystemSimple('Substack comment discussions'),
            user: commentThreadUser('Substack comment discussion'),
        },
    },
};
