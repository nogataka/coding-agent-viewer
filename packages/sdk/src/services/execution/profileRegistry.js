import { profileDefinitions } from './profiles/index.js';
export class ProfileRegistry {
    profiles = new Map();
    initialized = false;
    ensureInitialized() {
        if (this.initialized) {
            return;
        }
        const map = new Map();
        for (const entry of profileDefinitions) {
            const command = this.normalizeCommand(entry.command);
            if (!command) {
                continue;
            }
            const variants = Array.isArray(entry.variants)
                ? entry.variants
                    .map((variant) => {
                    if (!variant || typeof variant.label !== 'string') {
                        return null;
                    }
                    const variantCommand = this.normalizeCommand(variant.command);
                    if (!variantCommand) {
                        return null;
                    }
                    return {
                        label: variant.label,
                        command: variantCommand
                    };
                })
                    .filter((variant) => Boolean(variant))
                : undefined;
            map.set(entry.label, {
                label: entry.label,
                command,
                variants,
                buildProcessParameters: entry.buildProcessParameters
            });
        }
        this.profiles = map;
        this.initialized = true;
    }
    getProfile(label) {
        this.ensureInitialized();
        return this.profiles.get(label);
    }
    getVariant(label, variantLabel) {
        this.ensureInitialized();
        if (!variantLabel) {
            return null;
        }
        const profile = this.profiles.get(label);
        if (!profile || !profile.variants) {
            return null;
        }
        return profile.variants.find((variant) => variant.label === variantLabel) ?? null;
    }
    getCommand(label, variantLabel) {
        const variant = this.getVariant(label, variantLabel);
        if (variant) {
            return variant.command;
        }
        const profile = this.profiles.get(label);
        return profile ? profile.command : null;
    }
    normalizeCommand(command) {
        if (!command) {
            return null;
        }
        if (typeof command.binary !== 'string' || command.binary.trim() === '') {
            return null;
        }
        const args = Array.isArray(command.args)
            ? command.args.filter((arg) => typeof arg === 'string')
            : [];
        const env = command.env && typeof command.env === 'object' ? this.copyEnv(command.env) : undefined;
        return {
            binary: command.binary,
            args,
            env
        };
    }
    copyEnv(env) {
        const result = {};
        for (const [key, value] of Object.entries(env)) {
            if (typeof value === 'string') {
                result[key] = value;
            }
        }
        return result;
    }
}
//# sourceMappingURL=profileRegistry.js.map