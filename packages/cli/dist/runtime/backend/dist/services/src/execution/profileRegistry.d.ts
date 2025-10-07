import { CommandConfig, ProfileConfig, ProfileVariantConfig } from './types';
export declare class ProfileRegistry {
    private profiles;
    private initialized;
    private ensureInitialized;
    getProfile(label: string): ProfileConfig | undefined;
    getVariant(label: string, variantLabel?: string | null): ProfileVariantConfig | null;
    getCommand(label: string, variantLabel?: string | null): CommandConfig | null;
    private normalizeCommand;
    private copyEnv;
}
//# sourceMappingURL=profileRegistry.d.ts.map