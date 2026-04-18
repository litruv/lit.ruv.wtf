---
title: Welcome to My Blog
date: 2026-04-19
author: Max Litruv Boonzaayer
tags: welcome, meta, introduction
---

# Welcome to My Blog

This is my first blog post! I'm excited to share my thoughts and experiences with you.

## What This Blog Is About

This blog is built using a **custom node-based graph system** where each blog post is represented as a node in an interactive visual graph. Pretty cool, right?

### Features

- 📝 Markdown support with YAML front matter
- 📅 Date-based organization
- 🏷️ Tag system for categorization
- 🎨 Interactive node-based visualization
- 📁 Media support in `data/blog/media/`

## Technical Details

The build system automatically:
1. Scans the `data/blog/` directory for `.md` files
2. Parses YAML front matter for metadata
3. Generates a `blogs.json` file
4. Makes posts available to the BlogPostNode

You can reference images like this:
![Example](data/blog/media/example.png)

## Code Examples

Here's some example code:

```javascript
const greeting = "Hello, World!";
console.log(greeting);
```

## Conclusion

Stay tuned for more posts! This is just the beginning of an exciting journey.
