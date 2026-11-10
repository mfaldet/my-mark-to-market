import { DefaultSeo } from "next-seo"
import { getBaseUrl } from "../lib/base_url"
import { APP_NAME, APP_TAGLINE } from "../lib/app_name"

export default function Meta() {
  return (
    <DefaultSeo
      titleTemplate={`%s - ${APP_NAME}`}
      defaultTitle={APP_NAME}
      description={APP_TAGLINE}
      canonical={`${getBaseUrl()}/`}
      openGraph={{
        type: "website",
        locale: "en_US",
        url: `${getBaseUrl()}/`,
        title: APP_NAME,
        description: APP_TAGLINE,
        siteName: APP_NAME,
        images: [
          {
            url: `${getBaseUrl()}/brand/icon-512.png`,
            width: 512,
            height: 512,
            alt: "",
          },
        ],
      }}
    />
  )
}
