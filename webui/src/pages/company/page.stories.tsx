import type { Meta, StoryObj } from "@storybook/react-vite";

import { IDENTITIES } from "../../../.storybook/fixtures";
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
