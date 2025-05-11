import { memo } from "react"
import { AccountServiceClient } from "@/services/grpc-client"
import { EmptyRequest } from "@shared/proto_webview_types/common"

const AccountOptions = () => {
	const handleAccountClick = () => {
		AccountServiceClient.accountLoginClicked({ $type: "cline.EmptyRequest" }).catch((err) =>
			console.error("Failed to get login URL:", err),
		)
	}

	// Call handleAccountClick immediately when component mounts
	handleAccountClick()

	return null // This component doesn't render anything
}

export default memo(AccountOptions)
