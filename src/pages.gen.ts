// deno-fmt-ignore-file
// biome-ignore format: generated types do not need formatting
// prettier-ignore
import type { PathsForPages, GetConfigResponse, SearchCodecsForPages } from 'waku/router';

// prettier-ignore
import type { getConfig as File_404_getConfig } from './pages/404';
// prettier-ignore
import type { getConfig as File_Root_getConfig } from './pages/_root';
// prettier-ignore
import type { getConfig as File_ClientsClient_getConfig } from './pages/clients/[client]';
// prettier-ignore
import type { getConfig as File_ClientsIndex_getConfig } from './pages/clients/index';
// prettier-ignore
import type { getConfig as File_Contribute_getConfig } from './pages/contribute';
// prettier-ignore
import type { getConfig as File_Index_getConfig } from './pages/index';
// prettier-ignore
import type { getConfig as File_Method_getConfig } from './pages/method';
// prettier-ignore
import type { getConfig as File_ResultsRun_getConfig } from './pages/results/[run]';
// prettier-ignore
import type { getConfig as File_ResultsIndex_getConfig } from './pages/results/index';
// prettier-ignore
import type { getConfig as File_Run_getConfig } from './pages/run';

// prettier-ignore
type Page =
| ({ path: '/404' } & GetConfigResponse<typeof File_404_getConfig>)
| ({ path: '/_root' } & GetConfigResponse<typeof File_Root_getConfig>)
| ({ path: '/clients/[client]' } & GetConfigResponse<typeof File_ClientsClient_getConfig>)
| ({ path: '/clients' } & GetConfigResponse<typeof File_ClientsIndex_getConfig>)
| ({ path: '/contribute' } & GetConfigResponse<typeof File_Contribute_getConfig>)
| ({ path: '/' } & GetConfigResponse<typeof File_Index_getConfig>)
| ({ path: '/method' } & GetConfigResponse<typeof File_Method_getConfig>)
| ({ path: '/results/[run]' } & GetConfigResponse<typeof File_ResultsRun_getConfig>)
| ({ path: '/results' } & GetConfigResponse<typeof File_ResultsIndex_getConfig>)
| ({ path: '/run' } & GetConfigResponse<typeof File_Run_getConfig>);

// prettier-ignore
type Layout =
| { path: '/' };

// prettier-ignore
declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<Page>;
  }
  interface CreatePagesConfig {
    pages: Page;
    layouts: Layout;
  }
  interface SearchCodecsConfig extends SearchCodecsForPages<Page> {}
}
