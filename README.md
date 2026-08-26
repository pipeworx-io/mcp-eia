# EIA — U.S. Energy Information Administration

The official US energy data: petroleum, natural gas, electricity, coal, renewables, nuclear, total energy, international energy. Production, consumption, prices, reserves, imports/exports — at national, state, and (for electricity) plant level. Free, requires a free API key.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1476+ live data sources.

## Why this matters for AI agents

For energy questions — "what's the price of natural gas?", "how much electricity comes from solar?", "are gasoline prices rising?" — EIA is the source. Government-grade data, no commercial markup. Pair with [FRED](/docs/reference/fred) for energy-related macro indicators and [NOAA](/docs/reference/noaa) for energy-relevant weather context.

Common flows:

- **Spot prices.** "What's WTI crude trading at?" → crude oil spot price series.
- **State electricity mix.** "What % of California electricity is solar?" → state-level generation by source.
- **Retail gasoline.** "Average price for a gallon last week?" → weekly retail prices.
- **Natural gas storage.** "How much working gas in storage?" → weekly EIA-915 reports.

## Auth

EIA Open Data API requires a free key from https://www.eia.gov/opendata/register.php. Pass via `_apiKey`. Generous rate limits.

## Major datasets

| Dataset | Cadence | Use |
|---|---|---|
| Petroleum & Other Liquids | Weekly / monthly | Crude oil prices, gasoline, distillates, OPEC |
| Natural Gas | Weekly storage, monthly production | Pricing, storage, consumption |
| Electricity | Monthly | Generation by fuel, retail rates by state |
| Coal | Monthly / annual | Mining, prices, exports |
| Renewable & Alternative Fuels | Monthly | Solar, wind, biofuels, electric vehicle charging |
| Total Energy / Annual Energy Outlook | Annual | Long-term forecasts |

## Series IDs

EIA series follow `dataset_id.frequency.region.product` patterns. Examples:

- `PET.RWTC.D` — WTI crude, daily
- `NG.RNGC1.D` — Natural gas Henry Hub, daily
- `ELEC.GEN.SUN-CA-99.M` — California solar generation, monthly
- `PET.EMM_EPMR_PTE_NUS_DPG.W` — US weekly average regular gasoline price

Use the `eia_search` tool to find IDs rather than constructing them manually.

## Common pitfalls

- **Reporting lag varies.** Petroleum prices update weekly with ~3-day lag. Electricity generation is monthly with ~2-month lag. Don't assume "current" matches across datasets.
- **Heat content vs volume.** Natural gas reported in BCF (billion cubic feet), MMcf, and energy units (BTU, MMBtu). Conversions matter for cross-fuel comparison.
- **Net vs gross generation.** Power-plant generation has subtle definitions. "Net" subtracts plant-internal use. EIA mostly publishes net. Don't double-count.
- **State electricity by primary mover.** EIA's state-level mix is by primary mover (steam turbine, combined cycle, etc.) AND fuel — same plant can have multiple categorizations. Aggregate to the level your question requires.
- **Forecasts are scenarios.** AEO (Annual Energy Outlook) is a reference-case projection plus side-cases. Don't treat reference case as "what will happen."
- **No market-real-time prices.** EIA spot prices are official end-of-day; for intra-day market prices you need a commercial feed, not EIA.

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "eia": {
      "url": "https://gateway.pipeworx.io/eia/mcp"
    }
  }
}
```

### What this endpoint actually serves

`tools/list` at `https://gateway.pipeworx.io/eia/mcp` returns the tools in the table
above **plus the shared Pipeworx meta-tools** — `ask_pipeworx`,
`discover_tools`, `search_within`, `remember`/`recall` and the rest of the
gateway-wide set. So the tool count you see is larger than this table: a
single-pack endpoint currently lists roughly 30 shared tools alongside the
pack's own. The connection's `initialize` response states its exact scope, and
is the authoritative answer for a given day.

This is deliberate, not multiplexing by accident. The meta-tools are what let a
scoped connection answer a question this pack does not cover — via
`ask_pipeworx`, which routes across the whole catalog — without you adding a
second MCP server. There is currently no way to mount a pack endpoint without
them; if the extra schemas cost you more context than the routing is worth,
connect to the full gateway once rather than to several pack endpoints.

Or connect to the full Pipeworx gateway to get every pack's tools listed
directly, instead of just this one's:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

Both URLs reach the same gateway and the same 1476+ data sources. The
only difference is which pack's tools are listed **directly**; `ask_pipeworx`
reaches all of them from either one.

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English —
this works on the pack endpoint above as well as on the full gateway:

```
ask_pipeworx({ question: "your question about Eia data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
