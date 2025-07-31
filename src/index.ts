import axios from "axios";
import { Probot } from "probot";
import { HfInference } from "@huggingface/inference";
import sentiment from "sentiment";

export default (app: Probot) => {
  // Initialize Hugging Face client
  const hf = new HfInference(process.env.HUGGINGFACE_TOKEN);



  // Giphy meme service
  const giphyService = {
    search: async (query: string) => {
      try {
        const response = await axios.get(`https://api.giphy.com/v1/gifs/search`, {
          params: {
            api_key: process.env.GIPHY_API_KEY,
            q: query,
            limit: 10,
            rating: 'g'
          }
        });
        return response.data.data.map((gif: any) => gif.images.original.url);
      } catch (error) {
        console.log("❌ Giphy API error:", error instanceof Error ? error.message : String(error));
        return [];
      }
    }
  };



  console.log("App loaded");
  app.on("issues.opened", async (context) => {
    const issueComment = context.issue({
      body: "Thanks for opening this issue!",
    });
    await context.octokit.issues.createComment(issueComment);
  });

  app.onAny(async (context) => {
    console.log("🔔 ANY EVENT RECEIVED!");
    console.log(`🔔 Webhook received: ${context.name}`);
    console.log(`📦 Payload type: ${(context.payload as any).action || 'no action'}`);
    console.log(`🏷️ Event: ${context.name}.${(context.payload as any).action || 'created'}`);
    // console.log("📄 Full payload:", JSON.stringify(context.payload, null, 2));
  });

  // Add handler for regular PR comments too
  app.on("issue_comment.created", async (context) => {
    console.log("✅ Processing issue_comment.created");

    // Skip if the comment is from the bot itself to prevent infinite loops
    if (context.payload.comment.user.login === "review-comment-memes[bot]") {
      console.log("⏭️ Skipping - comment from bot itself");
      return;
    }

    // Only handle PR comments, not issue comments
    if (context.payload.issue.pull_request) {
      console.log("📝 PR Comment:", context.payload.comment.body);

      const comment = context.payload.comment.body;
      const prNumber = context.payload.issue.number;
      const repo = context.payload.repository.name;
      const owner = context.payload.repository.owner.login;

      console.log(`📊 PR #${prNumber} in ${owner}/${repo}`);

      // 1. Advanced sentiment analysis with keyword extraction
      let sentimentAnalysis = {
        category: "NEUTRAL",
        keywords: [] as string[],
        intensity: 0
      };

      try {
        console.log("🧠 Analyzing sentiment with Hugging Face...");
        const result = await hf.textClassification({
          model: "distilbert-base-uncased-finetuned-sst-2-english",
          inputs: comment,
        });

        const baseSentiment = result[0].label;
        const confidence = result[0].score;

        // Extract keywords from comment
        const words = comment.toLowerCase()
          .replace(/[^\w\s]/g, '')
          .split(/\s+/)
          .filter(word => word.length > 3);

        // Define detailed sentiment categories
        const sentimentCategories = {
          POSITIVE: {
            keywords: ['great', 'awesome', 'excellent', 'perfect', 'amazing', 'fantastic', 'brilliant', 'outstanding'],
            giphyQueries: ['awesome code', 'perfect code', 'brilliant programming', 'excellent developer']
          },
          NEGATIVE: {
            keywords: ['terrible', 'awful', 'horrible', 'bad', 'wrong', 'broken', 'bug', 'error', 'fail'],
            giphyQueries: ['bad code', 'programming fail', 'coding disaster', 'bug meme']
          },
          FRUSTRATED: {
            keywords: ['frustrated', 'annoying', 'ridiculous', 'stupid', 'dumb', 'wtf', 'why'],
            giphyQueries: ['frustrated programmer', 'coding frustration', 'developer rage']
          },
          CONFUSED: {
            keywords: ['confused', 'what', 'huh', 'unclear', 'unclear', 'complex', 'complicated'],
            giphyQueries: ['confused programmer', 'what is this code', 'coding confusion']
          },
          EXCITED: {
            keywords: ['excited', 'wow', 'incredible', 'mind-blowing', 'revolutionary', 'game-changer'],
            giphyQueries: ['excited programmer', 'amazing code', 'mind blowing programming']
          },
          SARCASM: {
            keywords: ['obviously', 'clearly', 'genius', 'brilliant', 'sure', 'whatever'],
            giphyQueries: ['sarcastic programmer', 'obviously genius', 'programming sarcasm']
          },
          NEUTRAL: {
            keywords: ['okay', 'fine', 'alright', 'sure', 'whatever', 'hmm'],
            giphyQueries: ['programming meme', 'code review', 'developer meme']
          }
        };

        // Determine detailed category based on keywords and sentiment
        let category = baseSentiment;
        let intensity = confidence;
        let extractedKeywords: string[] = [];

        // Check for specific keywords to override basic sentiment
        for (const [cat, config] of Object.entries(sentimentCategories)) {
          const matches = config.keywords.filter(keyword =>
            words.some(word => word.includes(keyword))
          );
          if (matches.length > 0) {
            category = cat;
            extractedKeywords = matches;
            intensity = Math.max(intensity, matches.length * 0.2);
            break;
          }
        }

        // Special cases for programming-specific terms
        if (words.some(word => ['bug', 'error', 'crash', 'fail'].includes(word))) {
          category = 'NEGATIVE';
          extractedKeywords.push('bug', 'error');
        }
        if (words.some(word => ['refactor', 'clean', 'optimize', 'improve'].includes(word))) {
          category = 'POSITIVE';
          extractedKeywords.push('refactor', 'improve');
        }

        sentimentAnalysis = {
          category,
          keywords: extractedKeywords,
          intensity
        };

        console.log(`🎭 Advanced Sentiment: ${category} (intensity: ${intensity.toFixed(2)})`);
        console.log(`🔑 Keywords: ${extractedKeywords.join(', ')}`);

      } catch (e) {
        console.log("🔄 Falling back to basic sentiment library...");
        const sentimentAnalyzer = new sentiment();
        const result = sentimentAnalyzer.analyze(comment);

        let category = "NEUTRAL";
        if (result.score > 0.3) category = "POSITIVE";
        else if (result.score < -0.3) category = "NEGATIVE";

        sentimentAnalysis = {
          category,
          keywords: [],
          intensity: Math.abs(result.score)
        };

        console.log(`🎭 Basic Sentiment: ${category} (score: ${result.score})`);
      }

      // 2. Select meme caption based on detailed sentiment
      const sentimentCaptions = {
        POSITIVE: ["Great review!", "Excellent feedback!", "Amazing work!", "Fantastic!", "Brilliant!"],
        NEGATIVE: ["Ouch!", "That's rough!", "Yikes!", "Oh no!", "This hurts!"],
        FRUSTRATED: ["Frustrated much?", "I feel you!", "The struggle is real!", "Why?!"],
        CONFUSED: ["What is this?", "I'm confused!", "Huh?", "What's happening?"],
        EXCITED: ["This is amazing!", "Mind blown!", "Incredible!", "Wow!"],
        SARCASM: ["Obviously genius!", "Clearly brilliant!", "Sure, sure!", "Whatever you say!"],
        NEUTRAL: ["Hmm...", "Interesting...", "Noted.", "I see...", "Okay..."]
      };

      const captions = sentimentCaptions[sentimentAnalysis.category as keyof typeof sentimentCaptions] || sentimentCaptions.NEUTRAL;
      const text0 = captions[Math.floor(Math.random() * captions.length)];
      const text1 = comment;

      console.log(`🎨 Generating meme: "${text0}" / "${text1}"`);

      // 3. Generate meme using Giphy API with detailed sentiment
      let memeUrl = null;

      try {
        console.log("🖼️ Searching Giphy API...");

        // Build search query based on sentiment category and keywords
        let giphyQuery = `${sentimentAnalysis.category.toLowerCase()}`;

        // Add keywords to search if available
        if (sentimentAnalysis.keywords.length > 0) {
          giphyQuery += ` ${sentimentAnalysis.keywords.join(' ')}`;
        }

        // Add intensity-based modifiers
        if (sentimentAnalysis.intensity > 0.7) {
          giphyQuery += ' extreme';
        } else if (sentimentAnalysis.intensity < 0.3) {
          giphyQuery += ' mild';
        }

        console.log(`🔍 Searching for: "${giphyQuery}"`);
        const giphyUrls = await giphyService.search(giphyQuery);

        if (giphyUrls.length > 0) {
          memeUrl = giphyUrls[Math.floor(Math.random() * giphyUrls.length)];
          console.log("✅ Giphy meme found:", memeUrl);
        } else {
          // Fallback to simpler query if no results
          const fallbackQuery = `${sentimentAnalysis.category.toLowerCase()} programming meme`;
          console.log(`🔄 Trying fallback query: "${fallbackQuery}"`);
          const fallbackUrls = await giphyService.search(fallbackQuery);
          if (fallbackUrls.length > 0) {
            memeUrl = fallbackUrls[Math.floor(Math.random() * fallbackUrls.length)];
            console.log("✅ Fallback meme found:", memeUrl);
          } else {
            console.log("❌ No Giphy memes found for any query");
          }
        }
      } catch (e) {
        console.log("❌ Giphy API error:", e instanceof Error ? e.message : String(e));
      }

      // 4. Post meme as a reply
      if (memeUrl) {
        try {
          console.log("💬 Posting meme comment...");
          await context.octokit.issues.createComment({
            owner,
            repo,
            issue_number: prNumber,
            body: `![meme](${memeUrl})\n\n_Sentiment: ${sentimentAnalysis.category} (${sentimentAnalysis.intensity.toFixed(2)})_`,
          });
          console.log("✅ Meme comment posted successfully!");
        } catch (e) {
          console.log("❌ Error posting comment:", e instanceof Error ? e.message : String(e));
        }
      } else {
        console.log("⚠️ No meme URL, skipping comment");
      }
    } else {
      console.log("⏭️ Skipping - not a PR comment");
    }
  });
};
