// Kotlin test file
package com.codebrain.test

data class User(
    val id: Int,
    val name: String,
    val email: String
) {
    fun getDisplayName(): String {
        return "$name ($email)"
    }
}

interface UserService {
    fun getUser(id: Int): User?
    fun createUser(user: User)
}

class UserServiceImpl : UserService {
    private val users = mutableMapOf<Int, User>()

    override fun getUser(id: Int): User? {
        return users[id]
    }

    override fun createUser(user: User) {
        users[user.id] = user
    }
}

fun createUser(name: String, email: String): User {
    return User(1, name, email)
}

object UserRepository {
    private val users = mutableListOf<User>()

    fun addUser(user: User) {
        users.add(user)
    }

    fun findAll(): List<User> {
        return users.toList()
    }
}
