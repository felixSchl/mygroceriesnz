// Function to fetch today's posts from a subreddit
export async function reddit_fetchTodaysPosts(
  subreddit: string
): Promise<void> {
  console.log(`Fetching posts from ${subreddit}`);
  subreddit = subreddit.replace(/^r\//, "");
  const response = await fetch(
    `https://www.reddit.com/r/${subreddit}/new.json?limit=100`
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch posts: ${response.statusText}`);
  }

  const data = await response.json();

  return data;
}
