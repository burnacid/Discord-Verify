import { registerAdminModule } from "./moduleRegistry.js";
import { rssRouter } from "./rssRoutes.js";
import { jtcRouter } from "./jtcRoutes.js";

registerAdminModule({ key: "rss", label: "RSS Feeds", navPath: "/admin/rss", router: rssRouter });
registerAdminModule({ key: "jtc", label: "Join to Create", navPath: "/admin/jtc", router: jtcRouter });
// Next module: registerAdminModule({ key: "foo", label: "Foo", navPath: "/admin/foo", router: fooRouter });
