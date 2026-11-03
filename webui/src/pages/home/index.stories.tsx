import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  AUDIT_ENTRIES,
  FLAG,
  IDENTITIES,
  LOADING,
  paginated,
} from "../../../.storybook/fixtures";
import { HomePage } from "./index";

const DAY = 24 * 60 * 60 * 1000;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

// Request suffixes the dashboard makes beyond the preview's defaults.
const CHANGES = "&pageSize=1";
const ACTIVITY = "/audit?teamId=t-core&pageSize=5";
const ROLLOUT = "/flags/f-onboarding";

const data = {
  [CHANGES]: { ...paginated([]), total: 27 },
  [ACTIVITY]: paginated(AUDIT_ENTRIES.slice(0, 5)),
  [ROLLOUT]: {
    ...FLAG,
    id: "f-onboarding",
    name: "new-onboarding",
    payload: {
      variations: { on: true, off: false },
      defaultRule: {
        progressiveRollout: {
          initial: { variation: "off", percentage: 0, date: iso(-3 * DAY) },
          end: { variation: "on", percentage: 100, date: iso(2 * DAY) },
        },
      },
    },
  },
};

const meta = {
  title: "Pages/Home/HomePage",
  component: HomePage,
  tags: ["autodocs"],
  parameters: {
    identity: IDENTITIES.member,
    route: { path: "/", url: "/" },
    data,
  },
} satisfies Meta<typeof HomePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loaded: Story = {};
// A viewer can't author flags: no Create flag button.
export const Viewer: Story = { parameters: { identity: IDENTITIES.viewer } };
export const EmptyTeam: Story = {
  parameters: {
    data: {
      ...data,
      "/teams/t-core/flagsets": [],
      "/teams/t-core/flags?pageSize=200": paginated([]),
      [CHANGES]: paginated([]),
      [ACTIVITY]: paginated([]),
    },
  },
};
export const Loading: Story = {
  parameters: {
    data: {
      "/teams/t-core/flagsets": LOADING,
      "/teams/t-core/flags?pageSize=200": LOADING,
      [CHANGES]: LOADING,
      [ACTIVITY]: LOADING,
    },
  },
};
export const NoTeam: Story = {
  parameters: { identity: IDENTITIES.companyAdmin },
};
