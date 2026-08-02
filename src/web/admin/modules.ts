import { registerAdminModule } from "./moduleRegistry.js";
import { rssRouter } from "./rssRoutes.js";
import { jtcRouter } from "./jtcRoutes.js";
import { welcomeRouter } from "./welcomeRoutes.js";
import { eventsRouter } from "./eventsRoutes.js";
import { geoRouter } from "./geoRoutes.js";
import { ICONS } from "../views/admin/icons.js";

registerAdminModule({ key: "rss", label: "RSS Feeds", navPath: "/admin/rss", router: rssRouter, icon: ICONS.rss });
registerAdminModule({ key: "jtc", label: "Join to Create", navPath: "/admin/jtc", router: jtcRouter, icon: ICONS.mic });
registerAdminModule({
  key: "welcome",
  label: "Welcome Message",
  navPath: "/admin/welcome",
  router: welcomeRouter,
  icon: ICONS.message,
});
registerAdminModule({
  key: "events",
  label: "Game Day Events",
  navPath: "/admin/events",
  router: eventsRouter,
  icon: ICONS.calendar,
});
registerAdminModule({ key: "geo", label: "GeoIP / VPN", navPath: "/admin/geo", router: geoRouter, icon: ICONS.globe });
// Next module: registerAdminModule({ key: "foo", label: "Foo", navPath: "/admin/foo", router: fooRouter, icon: ICONS.dashboard });
