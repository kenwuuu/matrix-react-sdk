/*
Copyright 2021 Šimon Brandner <simon.bra.ag@gmail.com>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { EventType } from "matrix-js-sdk/src/@types/event";
import { MatrixEvent } from "matrix-js-sdk/src/models/event";
import { CallEvent, CallState, CallType, MatrixCall } from "matrix-js-sdk/src/webrtc/call";
import { EventEmitter } from "events";

import LegacyCallHandler, { LegacyCallHandlerEvent } from "../../LegacyCallHandler";
import { MatrixClientPeg } from "../../MatrixClientPeg";

export enum LegacyCallEventGrouperEvent {
    StateChanged = "state_changed",
    SilencedChanged = "silenced_changed",
    LengthChanged = "length_changed",
}

const CONNECTING_STATES = [
    CallState.Connecting,
    CallState.WaitLocalMedia,
    CallState.CreateOffer,
    CallState.CreateAnswer,
];

const SUPPORTED_STATES = [CallState.Connected, CallState.Ringing, CallState.Ended];

export enum CustomCallState {
    Missed = "missed",
}

const isCallEventType = (eventType: string): boolean =>
    eventType.startsWith("m.call.") || eventType.startsWith("org.matrix.call.");

export const isCallEvent = (event: MatrixEvent): boolean => isCallEventType(event.getType());

export function buildLegacyCallEventGroupers(
    callEventGroupers: Map<string, LegacyCallEventGrouper>,
    events?: MatrixEvent[],
): Map<string, LegacyCallEventGrouper> {
    const newCallEventGroupers = new Map();
    events?.forEach((ev) => {
        if (!isCallEvent(ev)) {
            return;
        }

        const callId = ev.getContent().call_id;
        if (!newCallEventGroupers.has(callId)) {
            if (callEventGroupers.has(callId)) {
                // reuse the LegacyCallEventGrouper object where possible
                newCallEventGroupers.set(callId, callEventGroupers.get(callId));
            } else {
                newCallEventGroupers.set(callId, new LegacyCallEventGrouper());
            }
        }
        newCallEventGroupers.get(callId).add(ev);
    });
    return newCallEventGroupers;
}

export default class LegacyCallEventGrouper extends EventEmitter {
    private events: Set<MatrixEvent> = new Set<MatrixEvent>();
    private call: MatrixCall | null = null;
    public state: CallState | CustomCallState;

    public constructor() {
        super();

        LegacyCallHandler.instance.addListener(LegacyCallHandlerEvent.CallsChanged, this.setCall);
        LegacyCallHandler.instance.addListener(
            LegacyCallHandlerEvent.SilencedCallsChanged,
            this.onSilencedCallsChanged,
        );
    }

    private get invite(): MatrixEvent | undefined {
        return [...this.events].find((event) => event.getType() === EventType.CallInvite);
    }

    private get hangup(): MatrixEvent | undefined {
        return [...this.events].find((event) => event.getType() === EventType.CallHangup);
    }

    private get reject(): MatrixEvent | undefined {
        return [...this.events].find((event) => event.getType() === EventType.CallReject);
    }

    private get selectAnswer(): MatrixEvent | undefined {
        return [...this.events].find((event) => event.getType() === EventType.CallSelectAnswer);
    }

    public get isVoice(): boolean | undefined {
        const invite = this.invite;
        if (!invite) return undefined;

        // FIXME: Find a better way to determine this from the event?
        if (invite.getContent()?.offer?.sdp?.indexOf("m=video") !== -1) return false;
        return true;
    }

    public get hangupReason(): string | null {
        return this.call?.hangupReason ?? this.hangup?.getContent()?.reason ?? null;
    }

    public get rejectParty(): string | undefined {
        return this.reject?.getSender();
    }

    public get gotRejected(): boolean {
        return Boolean(this.reject);
    }

    public get duration(): number | null {
        if (!this.hangup || !this.selectAnswer) return null;
        return this.hangup.getDate().getTime() - this.selectAnswer.getDate().getTime();
    }

    /**
     * Returns true if there are only events from the other side - we missed the call
     */
    private get callWasMissed(): boolean {
        return ![...this.events].some((event) => event.sender?.userId === MatrixClientPeg.get().getUserId());
    }

    private get callId(): string | undefined {
        return [...this.events][0]?.getContent()?.call_id;
    }

    private get roomId(): string | undefined {
        return [...this.events][0]?.getRoomId();
    }

    private onSilencedCallsChanged = (): void => {
        const newState = LegacyCallHandler.instance.isCallSilenced(this.callId);
        this.emit(LegacyCallEventGrouperEvent.SilencedChanged, newState);
    };

    private onLengthChanged = (length: number): void => {
        this.emit(LegacyCallEventGrouperEvent.LengthChanged, length);
    };

    public answerCall = (): void => {
        LegacyCallHandler.instance.answerCall(this.roomId);
    };

    public rejectCall = (): void => {
        LegacyCallHandler.instance.hangupOrReject(this.roomId, true);
    };

    public callBack = (): void => {
        LegacyCallHandler.instance.placeCall(this.roomId, this.isVoice ? CallType.Voice : CallType.Video);
    };

    public toggleSilenced = (): void => {
        const silenced = LegacyCallHandler.instance.isCallSilenced(this.callId);
        silenced
            ? LegacyCallHandler.instance.unSilenceCall(this.callId)
            : LegacyCallHandler.instance.silenceCall(this.callId);
    };

    private setCallListeners(): void {
        if (!this.call) return;
        this.call.addListener(CallEvent.State, this.setState);
        this.call.addListener(CallEvent.LengthChanged, this.onLengthChanged);
    }

    private setState = (): void => {
        if (this.call && CONNECTING_STATES.includes(this.call.state)) {
            this.state = CallState.Connecting;
        } else if (this.call && SUPPORTED_STATES.includes(this.call.state)) {
            this.state = this.call.state;
        } else {
            if (this.callWasMissed) this.state = CustomCallState.Missed;
            else if (this.reject) this.state = CallState.Ended;
            else if (this.hangup) this.state = CallState.Ended;
            else if (this.invite && this.call) this.state = CallState.Connecting;
        }
        this.emit(LegacyCallEventGrouperEvent.StateChanged, this.state);
    };

    private setCall = (): void => {
        if (this.call) return;

        this.call = LegacyCallHandler.instance.getCallById(this.callId);
        this.setCallListeners();
        this.setState();
    };

    public add(event: MatrixEvent): void {
        if (this.events.has(event)) return; // nothing to do
        this.events.add(event);
        this.setCall();
    }
}
