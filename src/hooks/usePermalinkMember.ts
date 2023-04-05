/*
Copyright 2023 The Matrix.org Foundation C.I.C.

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

import { IMatrixProfile, MatrixEvent, Room, RoomMember } from "matrix-js-sdk/src/matrix";
import { useEffect, useState } from "react";

import { PillType } from "../components/views/elements/Pill";
import { SdkContextClass } from "../contexts/SDKContext";
import { PermalinkParts } from "../utils/permalinks/PermalinkConstructor";

const createMemberFromProfile = (userId: string, profile: IMatrixProfile): RoomMember => {
    const member = new RoomMember("", userId);
    member.name = profile.displayname ?? userId;
    member.rawDisplayName = member.name;
    member.events.member = {
        getContent: () => {
            return { avatar_url: profile.avatar_url };
        },
        getDirectionalContent: function () {
            // eslint-disable-next-line
            return this.getContent();
        },
    } as MatrixEvent;
    return member;
};

/**
 * Tries to determine the user Id of a permalink.
 * In case of a user permalink it is the user id.
 * In case of an event permalink it is the sender user Id of the event if that event is available.
 * Otherwise returns null.
 *
 * @param type - pill type
 * @param parseResult - permalink parse result
 * @param event - permalink event, if available
 * @returns permalink user Id. null if the Id cannot be determined.
 */
const determineUserId = (
    type: PillType | null,
    parseResult: PermalinkParts | null,
    event: MatrixEvent | null,
): string | null => {
    if (type === null) return null;

    if (parseResult?.userId) return parseResult.userId;

    if (event && [PillType.EventInSameRoom, PillType.EventInOtherRoom].includes(type)) {
        return event.getSender() ?? null;
    }

    return null;
};

/**
 * Tries to determine a RoomMember.
 *
 * @param userId - User Id to get the member for
 * @param targetRoom - permalink target room
 * @returns RoomMember of the target room if it exists.
 *          If sharing at least one room with the user, then the result will be the profile fetched via API.
 *          null in all other cases.
 */
const determineMember = (userId: string, targetRoom: Room): RoomMember | null => {
    const targetRoomMember = targetRoom.getMember(userId);

    if (targetRoomMember) return targetRoomMember;

    const knownProfile = SdkContextClass.instance.userProfilesStore.getOnlyKnownProfile(userId);

    if (knownProfile) {
        return createMemberFromProfile(userId, knownProfile);
    }

    return null;
};

/**
 * Hook to get the permalink member
 *
 * @param type - Permalink type
 * @param parseResult - Permalink parse result
 * @param targetRoom - Permalink target room {@link ./usePermalinkTargetRoom.ts}
 * @param event - Permalink event
 * @returns The permalink member:
 *          - The room member for a user mention
 *          - The sender for a permalink to an event in the same room
 *          - Null in other cases or the user cannot be loaded.
 */
export const usePermalinkMember = (
    type: PillType | null,
    parseResult: PermalinkParts | null,
    targetRoom: Room | null,
    event: MatrixEvent | null,
): RoomMember | null => {
    const shouldLookUpUser = type && [PillType.UserMention, PillType.EventInSameRoom].includes(type);
    console.log("shouldLookUpUser:", shouldLookUpUser);
    const userId = determineUserId(type, parseResult, event); // correct
    console.log("userId line 111:", userId);
    const userInRoom = shouldLookUpUser && userId && targetRoom ? determineMember(userId, targetRoom) : null;
    console.log("userInRoom:", userInRoom); // correct

    // TODO comment/uncomment the following lines to test broken/working code
    // const [member, setMember] = useState<RoomMember | null>(null);  // broken
    let member: RoomMember | null = userInRoom; // working

    console.log("member line 115:", member); // incorrect
    useEffect(() => {
        console.log("usePermalinkMember: useEffect called");
        console.log("member:", member);
        console.log("shouldLookUpUser:", shouldLookUpUser);
        console.log("targetRoom:", targetRoom);
        console.log("userId:", userId);

        if (!shouldLookUpUser || !userId || member) {
            console.log("usePermalinkMember: return");
            return;
        }

        const doProfileLookup = async (): Promise<void> => {
            const fetchedProfile = await SdkContextClass.instance.userProfilesStore.fetchOnlyKnownProfile(userId);

            if (fetchedProfile) {
                // TODO comment/uncomment the following lines to test broken/working code

                // broken
                // console.log("usePermalinkMember: fetchedProfile:", fetchedProfile);
                // const newMember = createMemberFromProfile(userId, fetchedProfile);
                // console.log("usePermalinkMember: newMember:", newMember);
                // setMember(newMember);

                // working
                console.log("usePermalinkMember: fetchedProfile:", fetchedProfile);
                member = createMemberFromProfile(userId, fetchedProfile);
                console.log("usePermalinkMember: member:", member);
            }
        };

        doProfileLookup();
    }, [member, shouldLookUpUser, targetRoom, userId]);

    console.log("usePermalinkMember: return member:", member); // incorrect
    return member;
};
