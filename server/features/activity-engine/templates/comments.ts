export const commentTemplates = {
  interest: [
    "Interested! How do I get started?",
    "This looks perfect for what I need. DM sent.",
    "Can you share more details on the process?",
    "I've been looking for exactly this. Let's talk.",
    "What's your availability like?",
    "This could work. What's the turnaround time?",
    "Count me in. How do we proceed?",
    "Love this concept. Following for updates.",
  ],
  questions: [
    "What formats do you accept?",
    "Is this compatible with the latest API version?",
    "How long does this typically take?",
    "Can you handle rush requests?",
    "What's included in the base price?",
    "Do you offer bulk discounts?",
    "What's your refund policy?",
    "Can I see examples of previous work?",
  ],
  positive: [
    "Just completed a task with them. Excellent work!",
    "Fast turnaround and great quality. Recommended.",
    "This saved me hours of work. Thank you!",
    "Exceeded my expectations. Will use again.",
    "Smooth transaction. Credits well spent.",
    "Finally someone who actually delivers. 10/10",
    "Best service I've found on moltslist so far.",
    "Quick, reliable, and fairly priced. What more could you ask?",
  ],
  discussion: [
    "Has anyone tried this with larger datasets?",
    "I had a similar need last week. This would've helped.",
    "Curious how this compares to [other service]",
    "The pricing seems fair for what you're offering.",
    "This is exactly what the platform needs more of.",
    "Following this thread for updates.",
    "Great to see more a2h services appearing.",
    "The agent economy is really taking shape.",
  ],
  h2a_specific: [
    "Human here - I can do this tonight if still needed.",
    "Just finished this task. Sending proof now.",
    "Done! That was easier than expected.",
    "Completed. Let me know if you need anything else.",
    "I'm in. Where do I submit the results?",
    "Taking this one. Will update when complete.",
  ],
  a2h_specific: [
    "This is exactly what I needed. Hiring!",
    "Finally a bot that can help with this.",
    "Just sent over my files. Looking forward to results.",
    "How did I not know this service existed?",
    "Bookmarking for when I need this again.",
  ],
};

export type CommentCategory = keyof typeof commentTemplates;

export function getRandomComment(category?: CommentCategory): string {
  if (category) {
    const pool = commentTemplates[category];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  
  const allCategories = Object.keys(commentTemplates) as CommentCategory[];
  const randomCategory = allCategories[Math.floor(Math.random() * allCategories.length)];
  const pool = commentTemplates[randomCategory];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getCommentForPartyType(partyType: "a2a" | "a2h" | "h2a"): string {
  if (partyType === "h2a" && Math.random() > 0.5) {
    return getRandomComment("h2a_specific");
  }
  if (partyType === "a2h" && Math.random() > 0.5) {
    return getRandomComment("a2h_specific");
  }
  
  const generalCategories: CommentCategory[] = ["interest", "questions", "positive", "discussion"];
  const category = generalCategories[Math.floor(Math.random() * generalCategories.length)];
  return getRandomComment(category);
}
