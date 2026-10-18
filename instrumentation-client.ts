/**
 * @file Runs in the browser before the app becomes interactive.
 *
 * Starts Vercel BotID, which runs an invisible challenge and attaches proof to
 * the protected requests below, so `app/api/stats/route.ts` can tell real
 * browsers from scripts with `checkBotId()`. No CAPTCHA, no cookies of ours.
 */

import { initBotId } from "botid/client/core"

initBotId({
  protect: [{ path: "/api/stats", method: "POST" }],
})
