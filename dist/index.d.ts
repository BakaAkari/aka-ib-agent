import { Schema, Context } from 'koishi';

declare const name = "aka-ibkr-agent";
declare const inject: readonly ["http"];
type ResponseMode = 'brief' | 'full' | 'push';
interface Config {
    baseUrl: string;
    timeout: number;
    authToken: string;
    defaultResponseMode: ResponseMode;
    showDiagnostics: boolean;
    minAuthority: number;
    allowedUsers: string[];
    chatCommandName: string;
    commandAliases: string[];
    enableMiddleware: boolean;
    middlewarePrefixes: string[];
    middlewareResponseMode: ResponseMode;
    allowDirectChat: boolean;
    ignoreSelf: boolean;
    privateOnly: boolean;
    platforms: string[];
    channelWhitelist: string[];
}
declare const Config: Schema<Config>;
declare function apply(ctx: Context, config: Config): void;

export { Config, apply, inject, name };
