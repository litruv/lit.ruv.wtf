/**
 * Bluesky command - Fetch recent posts from Bluesky
 */
export default {
    description: 'Fetch recent posts from Bluesky',
    execute: async (term, writeClickable, VERSION, args) => {
        const actor = 'lit.mates.dev';
        const limit = args[0] ? parseInt(args[0]) : 5;
        
        try {
            term.writeln('\r\n  Fetching posts from Bluesky...\r\n');
            
            const response = await fetch(
                `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${actor}&limit=${limit}`
            );
            
            if (!response.ok) {
                return '  Error: Unable to fetch Bluesky posts';
            }
            
            const data = await response.json();
            
            if (!data.feed || data.feed.length === 0) {
                return '  No posts found.';
            }
            
            let output = ['  ╔════════════════════════════════════════════════════╗'];
            output.push('  ║          BLUESKY POSTS - @lit.mates.dev            ║');
            output.push('  ╚════════════════════════════════════════════════════╝');
            output.push('');
            
            // Reverse to show oldest first, latest at bottom
            const reversedFeed = [...data.feed].reverse();
            
            reversedFeed.forEach((item, idx) => {
                const post = item.post;
                const text = post.record.text;
                const createdAt = new Date(post.record.createdAt);
                const date = createdAt.toLocaleDateString();
                const time = createdAt.toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                
                // Extract post ID from URI (at://did:plc:xxx/app.bsky.feed.post/{postId})
                const postId = post.uri.split('/').pop();
                const postUrl = `https://bsky.app/profile/${actor}/post/${postId}`;
                
                output.push(`  [${idx + 1}] ${date} ${time}`);
                output.push(`  ${postUrl}`);
                output.push('  ────────────────────────────────────────');
                
                // Wrap text to max 50 chars
                const words = text.split(' ');
                let line = '  ';
                words.forEach(word => {
                    if (line.length + word.length + 1 > 52) {
                        output.push(line);
                        line = '  ' + word;
                    } else {
                        line += (line.length > 2 ? ' ' : '') + word;
                    }
                });
                if (line.length > 2) output.push(line);
                
                output.push('');
                output.push(`  ♡ ${post.likeCount || 0}  ↻ ${post.repostCount || 0}  💬 ${post.replyCount || 0}`);
                output.push('');
            });
            
            output.push(`  Usage: bluesky [count] (default: 5, max: 20)`);
            output.push('');
            
            return output.join('\r\n');
        } catch (error) {
            return '  Error: Failed to connect to Bluesky API';
        }
    }
};
