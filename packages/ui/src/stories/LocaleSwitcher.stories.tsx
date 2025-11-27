import type { Meta, StoryObj } from "@storybook/react";
import { LocaleSwitcher } from "../components/LocaleSwitcher";
import { I18nextProvider } from "react-i18next";
import i18n from "../../../apps/web-app/src/i18n";

const meta: Meta<typeof LocaleSwitcher> = {
  title: "Internationalization/LocaleSwitcher",
  component: LocaleSwitcher,
  parameters: {
    a11y: {
      config: {
        rules: [
          { id: "color-contrast", enabled: true },
          { id: "label", enabled: true },
        ],
      },
    },
  },
  decorators: [
    (Story) => (
      <I18nextProvider i18n={i18n}>
        <div className="max-w-sm">
          <Story />
        </div>
      </I18nextProvider>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof LocaleSwitcher>;

export const Default: Story = {
  args: {
    languages: [
      { code: "en", name: "English", dir: "ltr" },
      { code: "ar", name: "العربية", dir: "rtl" },
    ],
  },
};
