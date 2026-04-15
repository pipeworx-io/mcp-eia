interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * EIA MCP — US Energy Information Administration API v2
 *
 * BYO key: requires a free API key from https://www.eia.gov/opendata/register.php
 * Passed via _apiKey parameter.
 *
 * API: https://api.eia.gov/v2
 *
 * Tools:
 * - eia_series: get any EIA time series by route path
 * - eia_petroleum: petroleum prices and supply data
 * - eia_natural_gas: natural gas prices, production, and storage
 * - eia_electricity: electricity generation and retail prices
 * - eia_ethanol: ethanol production and stocks (key for agriculture)
 */


const BASE = 'https://api.eia.gov/v2';

// ── Helpers ───────────────────────────────────────────────────────────

function extractKey(args: Record<string, unknown>): string {
  const key = args._apiKey as string;
  delete args._apiKey;
  if (!key) throw new Error('EIA API key required. Get one free at https://www.eia.gov/opendata/register.php and pass via _apiKey.');
  return key;
}

async function eiaGet(apiKey: string, route: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${BASE}/${route}/data/`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('sort[0][column]', 'period');
  url.searchParams.set('sort[0][direction]', 'desc');

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }
  }

  // Default to requesting the value field
  if (!params?.['data[0]']) {
    url.searchParams.set('data[0]', 'value');
  }

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`EIA API error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as Record<string, unknown>;

  if (data.error) {
    throw new Error(`EIA API error: ${JSON.stringify(data.error)}`);
  }

  return data;
}

interface EiaRecord {
  period?: string;
  value?: number;
  'series-description'?: string;
  seriesDescription?: string;
  duoarea?: string;
  areaName?: string;
  'area-name'?: string;
  product?: string;
  productName?: string;
  'product-name'?: string;
  process?: string;
  processName?: string;
  'process-name'?: string;
  units?: string;
  frequency?: string;
  [key: string]: unknown;
}

interface EiaResponse {
  response?: {
    total?: number;
    data?: EiaRecord[];
    description?: string;
  };
}

function formatEiaData(data: EiaResponse) {
  const response = data.response ?? {};
  const records = response.data ?? [];

  return {
    total: response.total ?? records.length,
    description: response.description ?? null,
    count: records.length,
    data: records.slice(0, 100).map((r) => ({
      period: r.period ?? null,
      value: r.value ?? null,
      description: r['series-description'] ?? r.seriesDescription ?? null,
      area: r['area-name'] ?? r.areaName ?? r.duoarea ?? null,
      product: r['product-name'] ?? r.productName ?? r.product ?? null,
      process: r['process-name'] ?? r.processName ?? r.process ?? null,
      units: r.units ?? null,
    })),
    truncated: records.length > 100,
  };
}

// ── Route lookup tables ──────────────────────────────────────────────

const PETROLEUM_ROUTES: Record<string, { route: string; facets?: Record<string, string> }> = {
  gasoline: { route: 'petroleum/pri/gnd', facets: { product: 'EPM0' } },
  diesel: { route: 'petroleum/pri/gnd', facets: { product: 'EPD2D' } },
  crude: { route: 'petroleum/pri/spt', facets: { product: 'EPCWTI' } },
  stocks: { route: 'petroleum/stoc/wstk' },
  supply: { route: 'petroleum/sum/sndw' },
  production: { route: 'petroleum/crd/crpdn' },
  imports: { route: 'petroleum/mov/imp' },
};

const NATGAS_ROUTES: Record<string, { route: string }> = {
  prices: { route: 'natural-gas/pri/sum' },
  production: { route: 'natural-gas/prod/sum' },
  consumption: { route: 'natural-gas/cons/sum' },
  storage: { route: 'natural-gas/stor/sum' },
  spot_prices: { route: 'natural-gas/pri/fut' },
};

const ELECTRICITY_ROUTES: Record<string, { route: string }> = {
  generation: { route: 'electricity/electric-power-operational-data' },
  retail_sales: { route: 'electricity/retail-sales' },
  prices: { route: 'electricity/retail-sales' },
  state_generation: { route: 'electricity/electric-power-operational-data' },
};

const ETHANOL_SERIES: Record<string, { route: string; facets?: Record<string, string> }> = {
  production: { route: 'petroleum/sum/sndw', facets: { product: 'EPOOXE' } },
  stocks: { route: 'petroleum/stoc/wstk', facets: { product: 'EPOOXE' } },
  imports: { route: 'petroleum/mov/imp', facets: { product: 'EPOOXE' } },
};

// ── Tool definitions ──────────────────────────────────────────────────

const tools: McpToolExport['tools'] = [
  {
    name: 'eia_series',
    description:
      'Get any EIA time series data by route path. The EIA API v2 uses a hierarchical route structure ' +
      '(e.g., "petroleum/pri/gnd" for gasoline prices, "natural-gas/pri/sum" for gas prices, ' +
      '"electricity/retail-sales" for electricity, "total-energy/data" for total energy). ' +
      'Returns time series with period, value, and metadata.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        _apiKey: { type: 'string', description: 'EIA API key (free from eia.gov)' },
        route: {
          type: 'string',
          description:
            'EIA data route path. Common routes: ' +
            '"petroleum/pri/gnd" (gasoline/diesel prices), ' +
            '"petroleum/pri/spt" (crude oil spot prices), ' +
            '"petroleum/stoc/wstk" (petroleum stocks), ' +
            '"petroleum/sum/sndw" (petroleum supply/demand weekly), ' +
            '"natural-gas/pri/sum" (natural gas prices), ' +
            '"natural-gas/stor/sum" (natural gas storage), ' +
            '"electricity/retail-sales" (electricity sales/prices), ' +
            '"total-energy/data" (total energy overview), ' +
            '"coal/shipments" (coal data)',
        },
        frequency: { type: 'string', description: 'Data frequency: "weekly", "monthly", "quarterly", "annual" (optional)' },
        start: { type: 'string', description: 'Start date, e.g., "2023-01" for monthly, "2023" for annual (optional)' },
        end: { type: 'string', description: 'End date (optional)' },
        limit: { type: 'number', description: 'Max records to return (default: 12, max: 5000)' },
      },
      required: ['_apiKey', 'route'],
    },
  },
  {
    name: 'eia_petroleum',
    description:
      'Get petroleum/fuel data — gasoline prices, diesel prices, crude oil prices, petroleum stocks, ' +
      'supply, production, and imports. Simplified interface to common EIA petroleum series.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        _apiKey: { type: 'string', description: 'EIA API key' },
        product: {
          type: 'string',
          description: 'Product type: "gasoline", "diesel", "crude", "stocks", "supply", "production", "imports"',
        },
        frequency: { type: 'string', description: 'Frequency: "weekly", "monthly", "annual" (optional, defaults vary by product)' },
        start: { type: 'string', description: 'Start date (optional)' },
        end: { type: 'string', description: 'End date (optional)' },
      },
      required: ['_apiKey', 'product'],
    },
  },
  {
    name: 'eia_natural_gas',
    description:
      'Get natural gas data — prices, production, consumption, and storage levels. ' +
      'Includes Henry Hub spot prices, underground storage, marketed production, and consumption by sector.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        _apiKey: { type: 'string', description: 'EIA API key' },
        series: {
          type: 'string',
          description: 'Data series: "prices", "production", "consumption", "storage", "spot_prices"',
        },
        frequency: { type: 'string', description: 'Frequency: "weekly", "monthly", "annual" (optional)' },
        start: { type: 'string', description: 'Start date (optional)' },
        end: { type: 'string', description: 'End date (optional)' },
      },
      required: ['_apiKey', 'series'],
    },
  },
  {
    name: 'eia_electricity',
    description:
      'Get electricity data — generation by fuel source, retail sales, and electricity prices. ' +
      'Covers coal, natural gas, nuclear, hydro, wind, and solar generation.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        _apiKey: { type: 'string', description: 'EIA API key' },
        series: {
          type: 'string',
          description: 'Data series: "generation", "retail_sales", "prices", "state_generation"',
        },
        frequency: { type: 'string', description: 'Frequency: "monthly", "quarterly", "annual" (optional)' },
        start: { type: 'string', description: 'Start date (optional)' },
        end: { type: 'string', description: 'End date (optional)' },
      },
      required: ['_apiKey', 'series'],
    },
  },
  {
    name: 'eia_ethanol',
    description:
      'Get fuel ethanol data — production volumes, stock levels, and imports. ' +
      'Key energy-agriculture intersection: most US ethanol is made from corn. ' +
      'Uses EIA petroleum supply data filtered for ethanol (EPOOXE product code).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        _apiKey: { type: 'string', description: 'EIA API key' },
        series: {
          type: 'string',
          description: 'Ethanol data type: "production", "stocks", "imports"',
        },
        frequency: { type: 'string', description: 'Frequency: "weekly", "monthly" (optional, defaults to weekly)' },
        start: { type: 'string', description: 'Start date (optional)' },
        end: { type: 'string', description: 'End date (optional)' },
      },
      required: ['_apiKey', 'series'],
    },
  },
];

// ── callTool dispatcher ───────────────────────────────────────────────

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const key = extractKey(args);

  switch (name) {
    case 'eia_series':
      return eiaSeries(key, args);
    case 'eia_petroleum':
      return eiaPetroleum(key, args);
    case 'eia_natural_gas':
      return eiaNaturalGas(key, args);
    case 'eia_electricity':
      return eiaElectricity(key, args);
    case 'eia_ethanol':
      return eiaEthanol(key, args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Tool implementations ─────────────────────────────────────────────

async function eiaSeries(apiKey: string, args: Record<string, unknown>) {
  const route = args.route as string;
  const params: Record<string, string> = {};

  if (args.frequency) params.frequency = args.frequency as string;
  if (args.start) params.start = args.start as string;
  if (args.end) params.end = args.end as string;
  params.length = String((args.limit as number) ?? 12);

  const data = await eiaGet(apiKey, route, params);
  return formatEiaData(data as EiaResponse);
}

async function eiaPetroleum(apiKey: string, args: Record<string, unknown>) {
  const product = (args.product as string).toLowerCase();
  const config = PETROLEUM_ROUTES[product];

  if (!config) {
    throw new Error(
      `Unknown petroleum product: "${product}". ` +
      `Available: ${Object.keys(PETROLEUM_ROUTES).join(', ')}`,
    );
  }

  const params: Record<string, string> = {};
  if (args.frequency) params.frequency = args.frequency as string;
  if (args.start) params.start = args.start as string;
  if (args.end) params.end = args.end as string;
  params.length = '24';

  if (config.facets) {
    for (const [k, v] of Object.entries(config.facets)) {
      params[`facets[${k}][]`] = v;
    }
  }

  const data = await eiaGet(apiKey, config.route, params);
  return {
    product,
    ...formatEiaData(data as EiaResponse),
  };
}

async function eiaNaturalGas(apiKey: string, args: Record<string, unknown>) {
  const series = (args.series as string).toLowerCase();
  const config = NATGAS_ROUTES[series];

  if (!config) {
    throw new Error(
      `Unknown natural gas series: "${series}". ` +
      `Available: ${Object.keys(NATGAS_ROUTES).join(', ')}`,
    );
  }

  const params: Record<string, string> = {};
  if (args.frequency) params.frequency = args.frequency as string;
  if (args.start) params.start = args.start as string;
  if (args.end) params.end = args.end as string;
  params.length = '24';

  const data = await eiaGet(apiKey, config.route, params);
  return {
    series,
    ...formatEiaData(data as EiaResponse),
  };
}

async function eiaElectricity(apiKey: string, args: Record<string, unknown>) {
  const series = (args.series as string).toLowerCase();
  const config = ELECTRICITY_ROUTES[series];

  if (!config) {
    throw new Error(
      `Unknown electricity series: "${series}". ` +
      `Available: ${Object.keys(ELECTRICITY_ROUTES).join(', ')}`,
    );
  }

  const params: Record<string, string> = {};
  if (args.frequency) params.frequency = args.frequency as string;
  if (args.start) params.start = args.start as string;
  if (args.end) params.end = args.end as string;
  params.length = '24';

  const data = await eiaGet(apiKey, config.route, params);
  return {
    series,
    ...formatEiaData(data as EiaResponse),
  };
}

async function eiaEthanol(apiKey: string, args: Record<string, unknown>) {
  const series = (args.series as string).toLowerCase();
  const config = ETHANOL_SERIES[series];

  if (!config) {
    throw new Error(
      `Unknown ethanol series: "${series}". ` +
      `Available: ${Object.keys(ETHANOL_SERIES).join(', ')}`,
    );
  }

  const params: Record<string, string> = {};
  if (args.frequency) params.frequency = (args.frequency as string) ?? 'weekly';
  if (args.start) params.start = args.start as string;
  if (args.end) params.end = args.end as string;
  params.length = '24';

  if (config.facets) {
    for (const [k, v] of Object.entries(config.facets)) {
      params[`facets[${k}][]`] = v;
    }
  }

  const data = await eiaGet(apiKey, config.route, params);
  return {
    series: `ethanol_${series}`,
    ...formatEiaData(data as EiaResponse),
  };
}

export default { tools, callTool, meter: { credits: 5 }, provider: 'eia' } satisfies McpToolExport;
