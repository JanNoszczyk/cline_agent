// Helper type for Protobuf maps (string to boolean in this case)
// This might need adjustment based on the specific proto definition if it uses a custom map message type
type ProtoBooleanMap = { [key: string]: boolean }
type ProtoStringMap = { [key: string]: string }

/**
 * Maps a TypeScript Record<string, boolean> to a Protobuf map<string, bool>.
 * Protobuf map fields cannot be directly assigned a Record.
 * @param record The TypeScript Record object.
 * @returns A Protobuf-compatible map object.
 */
export function mapStringRecordToProto(record?: Record<string, boolean>): ProtoBooleanMap {
	const protoMap: ProtoBooleanMap = {}
	if (record) {
		for (const key in record) {
			// Ensure the key is directly on the object, not from the prototype chain
			if (Object.prototype.hasOwnProperty.call(record, key)) {
				protoMap[key] = record[key]
			}
		}
	}
	return protoMap
}

/**
 * Maps a TypeScript Record<string, string> to a Protobuf map<string, string>.
 * @param record The TypeScript Record object.
 * @returns A Protobuf-compatible map object.
 */
export function mapStringStringRecordToProto(record?: Record<string, string>): ProtoStringMap {
	const protoMap: ProtoStringMap = {}
	if (record) {
		for (const key in record) {
			if (Object.prototype.hasOwnProperty.call(record, key)) {
				protoMap[key] = record[key]
			}
		}
	}
	return protoMap
}

/**
 * Maps a Protobuf map<string, bool> back to a TypeScript Record<string, boolean>.
 * @param protoMap The Protobuf map object.
 * @returns A TypeScript Record object.
 */
export function mapProtoToStringRecord(protoMap?: ProtoBooleanMap): Record<string, boolean> {
	const record: Record<string, boolean> = {}
	if (protoMap) {
		for (const key in protoMap) {
			if (Object.prototype.hasOwnProperty.call(protoMap, key)) {
				record[key] = protoMap[key]
			}
		}
	}
	return record
}

/**
 * Maps a Protobuf map<string, string> back to a TypeScript Record<string, string>.
 * @param protoMap The Protobuf map object.
 * @returns A TypeScript Record object.
 */
export function mapProtoToStringStringRecord(protoMap?: ProtoStringMap): Record<string, string> {
	const record: Record<string, string> = {}
	if (protoMap) {
		for (const key in protoMap) {
			if (Object.prototype.hasOwnProperty.call(protoMap, key)) {
				record[key] = protoMap[key]
			}
		}
	}
	return record
}
