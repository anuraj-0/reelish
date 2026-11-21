// Supadata responses recorded in the feasibility spike (spike/results/I*-*.sd-*.json), trimmed
// (CDN image URLs removed), plus model answers in our prompt's shape for the mocked AI call.

const author = { username: "themodernnonna", displayName: "Snejana Andreeva", verified: true };

export const PASTA_CAPTION = `VIRAL CRISPY PASTA SALAD 🥗

CRISPY PASTA:
150g pasta shells
Drizzle of olive oil
¼ cup freshly grated parmesan

Cook pasta in well-salted boiling water until al dente. Drain, toss with olive oil and parm, then air fry at 390°F for 10–12 minutes, tossing halfway, until golden and crispy.

YOGURT DRESSING:
½ cup plain yogurt
1 tbsp honey Dijon mustard
1/2-1 tbsp white balsamic vinegar, to taste
salt, to taste

Whisk everything together and adjust to taste.

THE VEG:
2 cups (½ head) romaine, finely diced
½ English cucumber, finely diced
1 cup cherry tomatoes, diced
¼ cup Kalamata olives
⅛ cup pepperoncini, diced

TO ASSEMBLE:

Add the veg and dressing to a bowl, toss in the crispy pasta and enjoy! All ingredients to taste. Serve immediately for max crunch.

#crunchypastasalad #viraltrend

IB: @tablebymax`;

export const SOUP_REEL_CAPTION = "Comment “recipe” and I’ll send it!\n⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀\nhttps://themodernnonna.com/creamy-vegetable-soup/";

export const meta = {
  pasta: { platform: "instagram", type: "video", id: "DWZqrugEacU", description: PASTA_CAPTION, author, media: { type: "video", duration: 18.575964 }, tags: [], additionalData: { shortcode: "DWZqrugEacU", isVideo: true, isReel: true } },
  soup: { platform: "instagram", type: "video", id: "DQZd7W8EbPx", description: SOUP_REEL_CAPTION, author, media: { type: "video", duration: 25.4 }, tags: [], additionalData: { shortcode: "DQZd7W8EbPx", isVideo: true, isReel: true } },
  turkey: { platform: "instagram", type: "video", id: "DPeUV0GjQnF", description: "", author, media: { type: "video", duration: 40.70399856567383 }, tags: [], additionalData: { shortcode: "DPeUV0GjQnF", isVideo: true, isReel: true } },
};

export const turkeyTranscript = {
  lang: "en",
  availableLangs: ["en"],
  content: [
    [0, "stop making these mistakes and make turkey like a chef there's a secret to making"],
    [4440, "the juiciest turkey to soften butter add the seasonings give it a good mix make"],
    [9040, "sure the turkey has thawed you pat it dry and you take out the giblets"],
    [12640, "massage it with the butter really well i like to get under the skin and"],
    [16300, "in the crevice in the crevice we also add an orange and tie the legs"],
    [20380, "for the secret we use julia child's method we melt butter with a little bit"],
    [24300, "of beer soak a cheesecloth and put it on top of the turkey to the"],
    [28320, "tray i'm adding some more water and beer and cooking it in the oven making"],
    [32220, "sure to baste. An hour before the turkey is done remove the cheesecloth and continue"],
    [36860, "to cook it until golden. Let it rest and follow for more."],
  ].map(([offset, text]) => ({ text, offset, duration: 4000, lang: "en" })),
};

const ing = (id: string, name: string, quantity: string | null, source: string | null, sources: string[], extra: Record<string, unknown> = {}) => ({
  id,
  name,
  group: null,
  quantity,
  quantity_source: source,
  quantity_quote: null,
  preparation: null,
  optional: false,
  sources,
  ...extra,
});
const step = (text: string, ids: string[], sources: string[], extra: Record<string, unknown> = {}) => ({
  text,
  ingredient_ids: ids,
  duration: null,
  temperature: null,
  heat: null,
  done_cue: null,
  video_timestamp: null,
  sources,
  quote: null,
  ...extra,
});
const base = { prep_time: null, cook_time: null, total_time: null, notes: [], conflicts: [], gaps: [] };

export const pastaAnswer = {
  ...base,
  is_recipe: true,
  title: "Viral Crispy Pasta Salad",
  servings: null,
  ingredients: [
    ing("pasta", "Pasta shells", "150g", "caption", ["caption"], { group: "Crispy pasta" }),
    ing("oil", "Olive oil", "Drizzle", "caption", ["caption"], { group: "Crispy pasta" }),
    ing("parm", "Parmesan", "¼ cup", "caption", ["caption"], { group: "Crispy pasta", preparation: "freshly grated" }),
    ing("yogurt", "Plain yogurt", "½ cup", "caption", ["caption"], { group: "Yogurt dressing" }),
    ing("mustard", "Honey Dijon mustard", "1 tbsp", "caption", ["caption"], { group: "Yogurt dressing" }),
    ing("vinegar", "White balsamic vinegar", "1/2-1 tbsp", "caption", ["caption"], { group: "Yogurt dressing" }),
    ing("romaine", "Romaine", "2 cups (½ head)", "caption", ["caption"], { group: "The veg", preparation: "finely diced" }),
  ],
  steps: [
    step("Cook the pasta in well-salted boiling water until al dente, then drain.", ["pasta"], ["caption"], { done_cue: "al dente" }),
    step("Toss with olive oil and parmesan, then air fry, tossing halfway.", ["pasta", "oil", "parm"], ["caption"], { duration: "10–12 minutes", temperature: "390°F", done_cue: "golden and crispy" }),
    step("Whisk the dressing ingredients together.", ["yogurt", "mustard", "vinegar"], ["caption"]),
    step("Toss the veg and dressing in a bowl, add the crispy pasta and serve immediately.", ["romaine"], ["caption"]),
  ],
};

export const soupReelAnswer = {
  ...base,
  is_recipe: true,
  title: "Creamy Vegetable Soup",
  servings: { text: "3", sources: ["linked_recipe"] },
  ingredients: [
    ing("oil", "Olive oil", "2 tablespoons", "linked_recipe", ["linked_recipe"]),
    ing("onion", "Onion", "1", "linked_recipe", ["linked_recipe"], { preparation: "diced" }),
    ing("broth", "Chicken broth", "4 cups", "linked_recipe", ["linked_recipe"]),
  ],
  steps: [step("Heat the oil in a big pot and add the onions.", ["oil", "onion"], ["linked_recipe"], { heat: "medium-high" }), step("Add the broth and simmer until the vegetables are soft.", ["broth"], ["linked_recipe"])],
};

export const turkeyAnswer = {
  ...base,
  is_recipe: true,
  title: "Juicy Roast Turkey",
  servings: null,
  ingredients: [
    ing("turkey", "Turkey", null, null, ["video_speech"]),
    ing("butter", "Butter", null, null, ["video_speech"], { preparation: "softened" }),
    ing("orange", "Orange", "1", "video_speech", ["video_speech"]),
    ing("beer", "Beer", "a little bit", "video_speech", ["video_speech"]),
  ],
  steps: [
    step("Mix softened butter with the seasonings.", ["butter"], ["video_speech"], { video_timestamp: "0:04" }),
    step("Pat the thawed turkey dry and remove the giblets.", ["turkey"], ["video_speech"], { video_timestamp: "0:09" }),
    step("Roast in the oven, basting, until golden.", ["turkey"], ["video_speech"], { video_timestamp: "0:28", done_cue: "golden" }),
  ],
  gaps: ["No oven temperature or roasting time given"],
};

/** A silent Reel whose amounts are only shown on screen (exercises the visual pass). */
export const silentVisualNotes = {
  recipe_title: "Iced Matcha Latte",
  ingredients: [
    { name: "matcha powder", quantity: "2 tsp", source: "on-screen text" },
    { name: "milk", quantity: "1 cup", source: "on-screen text" },
  ],
  cooking_steps: [{ step: "Whisk matcha with hot water, pour over iced milk." }],
  on_screen_text: ["2 tsp matcha", "1 cup milk", "whisk until frothy"],
};

export const silentAnswer = {
  ...base,
  is_recipe: true,
  title: "Iced Matcha Latte",
  servings: null,
  ingredients: [
    ing("matcha", "Matcha powder", "2 tsp", "video_on_screen_text", ["video_on_screen_text"]),
    ing("milk", "Milk", "1 cup", "video_on_screen_text", ["video_on_screen_text"]),
    ing("ice", "Ice", "a glass", "video_visual", ["video_visual"]),
  ],
  steps: [step("Whisk the matcha with hot water until frothy and pour over iced milk.", ["matcha", "milk", "ice"], ["video_on_screen_text"], { done_cue: "frothy" })],
};
