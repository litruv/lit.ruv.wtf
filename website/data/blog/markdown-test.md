---
title: Markdown Formatting Test
date: 2026-09-11
author: Test Author
tags: test, formatting, markdown
---
# Heading 1 test 123

## Heading 2

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6

## Text Formatting

This is **bold text** and this is *italic text* and this is ***bold italic text***.

Here's some `inline code` in a sentence.

## Links

Here's a [regular link](https://example.com) and here's a [YouTube link](https://youtube.com/watch?v=test).

## Lists

Unordered list:

* First item

* Second item

* Third item

Ordered list:

1. First step
2. Second step
3. Third step

## Code Blocks

Standard JavaScript:

```javascript
const hello = "world";
console.log(hello);

function test() {
    return true;
}
```

Python with syntax highlighting:

```python
def hello_world():
    print("Hello, World!")
    return True
```

Code with max height (200px):

```javascript
// This is a long code block that will scroll
const data = [1, 2, 3, 4, 5];

function processData(arr) {
    return arr.map(x => x * 2);
}

console.log(processData(data));

// Adding more lines to demonstrate scrolling
for (let i = 0; i < 10; i++) {
    console.log(`Iteration ${i}`);
}

// Even more content
const obj = {
    name: "Test",
    value: 42,
    nested: {
        deep: true
    }
};
```

## Blockquotes

> This is a blockquote.
> It can span multiple lines.
> And continues here.

## Horizontal Rule

***

## Images

![0.50](data/blog/media/test.gif "Caption Test")

![0.26](data/blog/media/paste-1778404389024-jnpo3.jpeg)

![1.00](blob:vscode-webview://1b6n822od8b3q8ir5r6it0k34211vkpefa12tlnhqbm9ukcvq8kt/f5da78e4-e0e9-4fd8-b889-6286ac0769f8 "Caption without resize")

## Mixed Content

<br />

You can mix **bold**, *italic*, and `code` in the same paragraph. Here's a [link with](https://example.com) **[bold](https://example.com)** [text](https://example.com) too.

### Nested Lists

* Top level itemsss

* Another top level

  * Nested item (if supported)

  * Another nested

1. Numbered item
2. Another numbered

   * Mixed with bullets

   * More bullets

## Special Characters

Testing special chars: < > & " '

## Long Paragraph

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
