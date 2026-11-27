import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";

import { FAILED, IDENTITIES } from "../../../.storybook/fixtures";
import { CompanyPage } from "./page";

const meta = {
  title: "Pages/Company/CompanyPage",
  component: CompanyPage,
  tags: ["autodocs"],
  parameters: {
    identity: IDENTITIES.companyAdmin,
    route: { path: "/company/*", url: "/company" },
  },
} satisfies Meta<typeof CompanyPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Details: Story = { args: { section: "details" } };
export const Members: Story = { args: { section: "members" } };
export const Teams: Story = { args: { section: "teams" } };
export const RelayProxy: Story = {
  args: { section: "relayProxy" },
  parameters: {
    data: {
      "/companies/acme/relay-proxy-secret": { secret: "goff_rp_4f9c2b7e", createdAt: "2026-11-26T10:00:00Z" },
    },
  },
};
// Relative to now so the previous secret is always still valid.
export const RelayProxyPreviousSecret: Story = {
  args: { section: "relayProxy" },
  parameters: {
    data: {
      "/companies/acme/relay-proxy-secret": {
        secret: "goff_rp_4f9c2b7e",
        createdAt: "2026-11-26T10:00:00Z",
        previousExpiresAt: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
        previousSecretEnd: "1d0e3",
      },
    },
  },
};
export const RelayProxyNoSecret: Story = {
  args: { section: "relayProxy" },
  parameters: { data: { "/companies/acme/relay-proxy-secret": null } },
};


const relayProxyConfiguration = {
  flagSets: [{
    name: "production",
    apiKeys: ["goff_api_example"],
    fileFormat: "json",
    retrievers: [{
      kind: "http",
      url: "https://studio.example/api/v1/relay-proxy/flagsets/production/flags.json",
      headers: { Authorization: ["Bearer goff_rp_4f9c2b7e"] },
    }],
    evaluationContextEnrichment: { environment: "production" },
    pollingInterval: 60000,
  }],
};

export const RelayProxyConfiguration: Story = {
  ...RelayProxy,
  parameters: {
    data: {
      ...RelayProxy.parameters?.data,
      "/relay-proxy/flagsets.json": relayProxyConfiguration,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "See relay proxy flagset configuration" }));
    await canvas.findByRole("region", { name: "Flagset configuration YAML" });
  },
};

export const RelayProxyConfigurationEmpty: Story = {
  ...RelayProxyConfiguration,
  parameters: {
    data: { ...RelayProxy.parameters?.data, "/relay-proxy/flagsets.json": { flagSets: [] } },
  },
};

export const RelayProxyConfigurationError: Story = {
  ...RelayProxy,
  parameters: {
    data: { ...RelayProxy.parameters?.data, "/relay-proxy/flagsets.json": FAILED },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "See relay proxy flagset configuration" }));
    await canvas.findByRole("button", { name: "Retry" });
  },
};
