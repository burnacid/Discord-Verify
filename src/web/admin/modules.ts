import { registerAdminModule } from "./moduleRegistry.js";
import { rssRouter } from "./rssRoutes.js";
import { jtcRouter } from "./jtcRoutes.js";
import { welcomeRouter } from "./welcomeRoutes.js";
import { eventsRouter } from "./eventsRoutes.js";

registerAdminModule({ key: "rss", label: "RSS Feeds", navPath: "/admin/rss", router: rssRouter });
registerAdminModule({ key: "jtc", label: "Join to Create", navPath: "/admin/jtc", router: jtcRouter });
registerAdminModule({ key: "welcome", label: "Welcome Message", navPath: "/admin/welcome", router: welcomeRouter });
registerAdminModule({ key: "events", label: "Game Day Events", navPath: "/admin/events", router: eventsRouter });
// Next module: registerAdminModule({ key: "foo", label: "Foo", navPath: "/admin/foo", router: fooRouter });
