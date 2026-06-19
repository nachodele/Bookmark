export const ABOUT = {
  title: 'About Bookmark',
  body: `Bookmark is your universal Save button for the internet.

Share a link from any app — YouTube, Instagram, TikTok, articles — and AI organizes it into visual boards that match how you think: Music, Football, Recipes, Design… not just "YouTube" or "Instagram".

We believe saved content should be structured, searchable, and easy to revisit — not lost in DMs, camera rolls, or browser tabs.

Built for people who collect ideas, inspiration, and resources across the web.`,
};

export const GUIDE = {
  title: 'How to use Bookmark',
  intro:
    'Bookmark learns from the boards you create. A few minutes of setup makes classification feel personal instead of generic.',
  steps: [
    {
      title: '1. Create your boards first',
      body:
        'Before sharing links, tap + on the home screen and add the categories you actually use — e.g. Fitness, Calisthenics, CrossFit, Recipes, Techno.\n\nYou can use broad names (Fitness) or specific ones (CrossFit). Both work.',
    },
    {
      title: '2. Your boards get priority',
      body:
        'When you share a link, AI checks your boards first. If you have Calisthenics, a plank video goes there — even if it could also fit CrossFit or Fitness.\n\nSame link, different users, different boards. That\'s intentional.',
    },
    {
      title: '3. Share from any app',
      body:
        'Tap Share → Bookmark. We fetch the title, description, and thumbnail, then sort the link automatically.\n\nYou need a dev or production build (not Expo Go) for the Share Sheet.',
    },
    {
      title: '4. Review and adjust',
      body:
        'Tap any save to edit the title, move it to another board, or delete it. AI gets you 90% there — you stay in control.',
    },
    {
      title: 'Tips',
      body:
        '• Broad boards (Fitness, Food) are fine when a link fits many topics\n• Specific boards (CrossFit, K-Pop) when you want tighter organization\n• Rename or merge boards anytime from the board menu\n• Works offline for browsing; saving needs internet',
    },
  ],
};

export const FAQ = [
  {
    q: 'How do I save a link?',
    a: 'Tap Share in any app, choose Bookmark, and we\'ll classify and save it automatically. You must be signed in.',
  },
  {
    q: 'How does AI classification work?',
    a: 'We read the link title, description, and metadata. Your existing boards are checked first, then our category catalog. See "How to use Bookmark" for tips.',
  },
  {
    q: 'Can I move or edit saves?',
    a: 'Tap any link to view full details. From there you can edit the title and description, move it to another board, or delete it.',
  },
  {
    q: 'Does it work offline?',
    a: 'You can browse cached boards offline. Saving requires an internet connection.',
  },
  {
    q: 'Is my data private?',
    a: 'Yes. Each account only sees its own boards and links. Data is stored securely in Supabase.',
  },
];

export const SUPPORT = {
  title: 'Support',
  body: 'Need help or want to report a bug?\n\nEmail: supportbookmark@gmail.com\n\nInclude your device model and what you were trying to do. We typically respond within 48 hours.',
};
