// Excerpts of the real descriptions of our three YouTube test videos (YouTube Data API, 2026-11-21),
// trimmed to the parts the tests need.

export const SOUP_DESCRIPTION = `Mom & Dad taught me how to make the HEALTHIEST creamy soups without the heavy cream 🤯 #shorts

This might be the healthiest cream of hidden veggie soup you’ve ever had! The secret ingredient to making it just as velvety and creamy, is potatoes! To cut back on time I used my favourite organic broth by Kettle & Fire @kettleandfire.

INGREDIENTS:
2 tablespoons olive oil
1 diced yellow onion
2 diced carrots
2 celery stalks
2 garlic cloves quartered
salt and pepper to taste
1 small head of cauliflower separated into florets about 5 cups total
3 medium yellow potatoes 3 cups peeled and quartered
4 cups chicken or veggie broth
2 cups water
chives + bacon bits for presentation are optional

✨You can find the full printable recipe with tips and directions on my website which is linked here:
https://www.themodernnonna.com/healthiest-cream-of-hidden-veggie-soup/

Or you can search for “soup" in the search tab on my blog and it will pop right up 🌐www.themodernnonna.com

#soup #vegetablesoup #shorts`;

export const CARBONARA_DESCRIPTION = `RIP dear Antonio. You will be truly missed.  X

The legendary Antonio Carluccio finally makes his debut on Food Tube! ... his authentic Italian carbonara recipe. So simple. So tasty.

Recipe here: http://goo.gl/QuRCzK

In the meantime you can read more of his fantastic pasta recipes in his new book: http://goo.gl/509kJ3

And you can read more great recipes in the Two Greedy Italians book written with Food Tube's very own Gennaro Contaldo: http://goo.gl/yLNlkJ

Links from the video:
Perfect Spaghetti Bolognese | http://goo.gl/4solzy
More Food Tube videos | http://goo.gl/D9NMja

For more nutrition info, click here: http://jamieol.com/D3JimM

Jamie Oliver's Food Tube | http://goo.gl/EdJ0vK
Subscribe to Food Tube | http://goo.gl/v0tQr
Twitter: https://twitter.com/JamiesFoodTube
Facebook | http://goo.gl/7R0xdh
More great recipes | http://www.jamieoliver.com

#FOODTUBE`;

export const KAJU_DESCRIPTION = `https://www.instagram.com/reel/DfKKSIcBla3/?cplk=YnVpaXhlaWJudnNh

Above is the link that helped me learn this amazing recipe.`;

/** A videos.list item as the API returns it. */
export function apiItem(over: { id: string; title: string; description: string; duration: string; privacy?: string; live?: string; ytRating?: string }) {
  return {
    kind: "youtube#video",
    id: over.id,
    snippet: {
      title: over.title,
      description: over.description,
      channelTitle: "The Modern Nonna",
      channelId: "UC123",
      liveBroadcastContent: over.live ?? "none",
      defaultAudioLanguage: "en",
      thumbnails: { high: { url: `https://i.ytimg.com/vi/${over.id}/hqdefault.jpg` }, default: { url: `https://i.ytimg.com/vi/${over.id}/default.jpg` } },
    },
    contentDetails: { duration: over.duration, contentRating: over.ytRating ? { ytRating: over.ytRating } : {} },
    status: { privacyStatus: over.privacy ?? "public", uploadStatus: "processed", embeddable: true },
  };
}

/** A recipe page with the creator's JSON-LD, in the @graph shape WordPress recipe plugins emit. */
export function recipePage(opts: { name: string; embedVideoId?: string; ingredients?: string[]; sections?: boolean }) {
  const ingredients = opts.ingredients ?? [
    "2 tablespoons olive oil",
    "1 onion (diced)",
    "2 carrots (diced)",
    "2 celery ribs",
    "2 garlic cloves (quartered)",
    "salt (to taste)",
    "5 cups cauliflower (small head )",
    "3 potatoes (peeled and quartered)",
    "4 cups chicken broth",
    "2 cups water",
  ];
  const steps = [
    { "@type": "HowToStep", text: "In a big pot on medium high heat add olive oil and add the onions." },
    { "@type": "HowToStep", text: "Add the carrots, celery, garlic and saut&eacute; for a few minutes." },
    { "@type": "HowToStep", text: "Cover with stock and water. Let it come to a boil. Reduce the heat to medium-low, cook for 25 to 30 minutes." },
  ];
  const recipe = {
    "@type": "Recipe",
    name: opts.name,
    recipeYield: ["3", "3 servings"],
    totalTime: "PT40M",
    recipeIngredient: ingredients,
    recipeInstructions: opts.sections ? [{ "@type": "HowToSection", name: "Soup", itemListElement: steps }] : steps,
  };
  const graph = { "@context": "https://schema.org", "@graph": [{ "@type": "WebSite", name: "Blog" }, recipe] };
  return `<!doctype html><html><head><title>${opts.name}</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"x"}</script>
<script type="application/ld+json" class="yoast-schema-graph">${JSON.stringify(graph)}</script>
</head><body>${opts.embedVideoId ? `<iframe src="https://www.youtube.com/embed/${opts.embedVideoId}"></iframe>` : ""}<p>Lots of story text…</p></body></html>`;
}
